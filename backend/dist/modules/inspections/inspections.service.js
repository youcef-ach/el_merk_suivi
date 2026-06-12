"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.InspectionsService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
const storage_service_1 = require("../storage/storage.service");
const os = require("os");
const path = require("path");
const fs = require("fs");
const child_process_1 = require("child_process");
const util_1 = require("util");
const client_1 = require("@prisma/client");
let InspectionsService = class InspectionsService {
    constructor(prisma, storageService) {
        this.prisma = prisma;
        this.storageService = storageService;
    }
    async create(projectId, createInspectionDto, userEnterpriseId) {
        return this.prisma.inspection.create({
            data: {
                ...createInspectionDto,
                projectId,
            },
        });
    }
    async findAll(projectId, user) {
        if (!user) {
            return this.prisma.inspection.findMany({
                where: { projectId, visibility: client_1.Visibility.PUBLIC },
            });
        }
        if (user.role === client_1.Role.ADMIN) {
            return this.prisma.inspection.findMany({ where: { projectId } });
        }
        return this.prisma.inspection.findMany({
            where: {
                projectId,
                OR: [
                    { visibility: client_1.Visibility.PUBLIC },
                    { authorizedViewers: { some: { id: user.id } } },
                ],
            },
        });
    }
    async findOne(id, user) {
        const inspection = await this.prisma.inspection.findUnique({
            where: { id },
            include: {
                project: true,
                scans: true,
                tags: { include: { documents: true } },
                panoramas: true,
                areaPointers: true,
                authorizedViewers: true,
                stagingProfiles: {
                    include: {
                        stagedItems: true,
                        bakedPanoramas: true
                    }
                },
            },
        });
        if (!inspection) {
            throw new common_1.NotFoundException('Inspection not found');
        }
        if (inspection.visibility === client_1.Visibility.PUBLIC) {
            return inspection;
        }
        if (!user) {
            throw new common_1.ForbiddenException('You must be logged in to access this private inspection');
        }
        if (user.role === client_1.Role.ADMIN || inspection.project?.enterpriseId === user.enterpriseId) {
            return inspection;
        }
        const isAuthorized = inspection.authorizedViewers.some((v) => v.id === user.id);
        if (!isAuthorized) {
            throw new common_1.ForbiddenException('You are not authorized to view this private inspection');
        }
        return inspection;
    }
    async getBundle(id, user) {
        const inspection = await this.findOne(id, user);
        return inspection;
    }
    async clone(id, userEnterpriseId, role) {
        const original = await this.prisma.inspection.findUnique({
            where: { id },
            include: {
                project: true,
                scans: true,
                panoramas: true,
                tags: { include: { documents: true } },
                areaPointers: true,
                authorizedViewers: true,
                stagingProfiles: {
                    include: {
                        stagedItems: true,
                        bakedPanoramas: true
                    }
                },
            },
        });
        if (!original)
            throw new common_1.NotFoundException('Inspection not found');
        if (original.project.enterpriseId !== userEnterpriseId && role !== client_1.Role.ADMIN) {
            throw new common_1.ForbiddenException('Only the enterprise admin can clone this inspection');
        }
        const newInspection = await this.prisma.inspection.create({
            data: {
                title: `${original.title} (Copy)`,
                description: original.description,
                glbModelUrl: original.glbModelUrl,
                scansJsonUrl: original.scansJsonUrl,
                thumbnailUrl: original.thumbnailUrl,
                videoUrl: original.videoUrl,
                visibility: original.visibility,
                projectId: original.projectId,
                authorizedViewers: {
                    connect: original.authorizedViewers.map(v => ({ id: v.id }))
                }
            }
        });
        const oldToNewScanId = new Map();
        for (const scan of original.scans) {
            const newScan = await this.prisma.scan.create({
                data: {
                    posX: scan.posX,
                    posY: scan.posY,
                    posZ: scan.posZ,
                    quatW: scan.quatW,
                    quatX: scan.quatX,
                    quatY: scan.quatY,
                    quatZ: scan.quatZ,
                    inspectionId: newInspection.id,
                }
            });
            oldToNewScanId.set(scan.id, newScan.id);
        }
        for (const scan of original.scans) {
            if (scan.targetScanId && oldToNewScanId.has(scan.targetScanId)) {
                await this.prisma.scan.update({
                    where: { id: oldToNewScanId.get(scan.id) },
                    data: { targetScanId: oldToNewScanId.get(scan.targetScanId) }
                });
            }
        }
        for (const pan of original.panoramas) {
            await this.prisma.panorama.create({
                data: {
                    imageUrl: pan.imageUrl,
                    status: pan.status,
                    inspectionId: newInspection.id,
                }
            });
        }
        for (const ptr of original.areaPointers) {
            await this.prisma.areaPointer.create({
                data: {
                    name: ptr.name,
                    color: ptr.color,
                    posX: ptr.posX,
                    posY: ptr.posY,
                    posZ: ptr.posZ,
                    height: ptr.height,
                    thickness: ptr.thickness,
                    labelSize: ptr.labelSize,
                    sizeX: ptr.sizeX,
                    sizeY: ptr.sizeY,
                    wallHeight: ptr.wallHeight,
                    inspectionId: newInspection.id,
                }
            });
        }
        for (const tag of original.tags) {
            const newTag = await this.prisma.tag.create({
                data: {
                    title: tag.title,
                    description: tag.description,
                    posX: tag.posX,
                    posY: tag.posY,
                    posZ: tag.posZ,
                    icon: tag.icon,
                    color: tag.color,
                    size: tag.size,
                    inspectionId: newInspection.id,
                }
            });
            for (const doc of tag.documents) {
                await this.prisma.tagDocument.create({
                    data: {
                        title: doc.title,
                        fileUrl: doc.fileUrl,
                        tagId: newTag.id,
                    }
                });
            }
        }
        return newInspection;
    }
    async createScan(inspectionId, dto, userEnterpriseId, role) {
        const inspection = await this.prisma.inspection.findUnique({ where: { id: inspectionId }, include: { project: true } });
        if (!inspection)
            throw new common_1.NotFoundException('Inspection not found');
        if (inspection.project.enterpriseId !== userEnterpriseId && role !== client_1.Role.ADMIN) {
            throw new common_1.ForbiddenException('Only the creator or admin can add a scan');
        }
        if (dto.targetScanId) {
            const targetScan = await this.prisma.scan.findUnique({ where: { id: dto.targetScanId } });
            if (!targetScan)
                throw new common_1.NotFoundException('Target scan not found');
            if (targetScan.inspectionId !== inspectionId) {
                throw new common_1.ForbiddenException('Target scan must belong to the same inspection');
            }
        }
        return this.prisma.scan.create({
            data: {
                ...dto,
                inspectionId,
            },
        });
    }
    async createPanorama(inspectionId, dto, userEnterpriseId, role) {
        const inspection = await this.prisma.inspection.findUnique({ where: { id: inspectionId }, include: { project: true } });
        if (!inspection)
            throw new common_1.NotFoundException('Inspection not found');
        if (inspection.project.enterpriseId !== userEnterpriseId && role !== client_1.Role.ADMIN) {
            throw new common_1.ForbiddenException('Only the creator or admin can add a panorama');
        }
        return this.prisma.panorama.create({
            data: {
                ...dto,
                status: client_1.ProcessingStatus.PENDING,
                inspectionId,
            },
        });
    }
    async updatePanoramaStatus(id, dto, role) {
        if (role !== client_1.Role.ADMIN) {
            throw new common_1.ForbiddenException('Only admins or verified workers can update status');
        }
        const panorama = await this.prisma.panorama.findUnique({ where: { id } });
        if (!panorama)
            throw new common_1.NotFoundException('Panorama not found');
        return this.prisma.panorama.update({
            where: { id },
            data: { status: dto.status },
        });
    }
    async setPermissions(id, dto, userEnterpriseId, role) {
        const inspection = await this.prisma.inspection.findUnique({ where: { id }, include: { project: true } });
        if (!inspection)
            throw new common_1.NotFoundException('Inspection not found');
        if (inspection.project.enterpriseId !== userEnterpriseId && role !== client_1.Role.ADMIN) {
            throw new common_1.ForbiddenException('Only the creator or admin can update permissions');
        }
        return this.prisma.inspection.update({
            where: { id },
            data: {
                authorizedViewers: {
                    set: dto.authorizedViewerIds.map((vId) => ({ id: vId })),
                },
            },
            include: { authorizedViewers: true }
        });
    }
    async remove(id, userEnterpriseId, role) {
        const inspection = await this.prisma.inspection.findUnique({ where: { id }, include: { project: true } });
        if (!inspection)
            throw new common_1.NotFoundException('Inspection not found');
        if (inspection.project.enterpriseId !== userEnterpriseId && role !== client_1.Role.ADMIN) {
            throw new common_1.ForbiddenException('Only the creator or admin can delete this inspection');
        }
        return this.prisma.inspection.delete({ where: { id } });
    }
    async update(id, dto, enterpriseId, role) {
        const inspection = await this.prisma.inspection.findUnique({ where: { id }, include: { project: true } });
        if (!inspection)
            throw new common_1.NotFoundException('Inspection not found');
        if (inspection.project?.enterpriseId !== enterpriseId && role !== client_1.Role.ADMIN) {
            throw new common_1.ForbiddenException('Only the enterprise admin can update this inspection');
        }
        return this.prisma.inspection.update({
            where: { id },
            data: dto,
        });
    }
    async getUploadUrl(id, fileName, userEnterpriseId, role) {
        const inspection = await this.prisma.inspection.findUnique({ where: { id }, include: { project: true } });
        if (!inspection)
            throw new common_1.NotFoundException('Inspection not found');
        if (inspection.project.enterpriseId !== userEnterpriseId && role !== client_1.Role.ADMIN) {
            throw new common_1.ForbiddenException('Only the creator or admin can upload files to this inspection');
        }
        const bucket = 'virtual-inspections';
        const s3Path = `inspections/${id}/${fileName}`;
        const presignedUrl = await this.storageService.getPresignedPutUrl(bucket, s3Path);
        if (fileName.endsWith('.glb')) {
            await this.prisma.inspection.update({
                where: { id },
                data: { glbModelUrl: s3Path },
            });
        }
        else if (fileName.endsWith('scans.json')) {
            await this.prisma.inspection.update({
                where: { id },
                data: { scansJsonUrl: s3Path },
            });
        }
        return { presignedUrl, expectedPath: s3Path };
    }
    async processAndUploadScans(id, mpData, rcData, userEnterpriseId, role) {
        const inspection = await this.prisma.inspection.findUnique({ where: { id }, include: { project: true } });
        if (!inspection)
            throw new common_1.NotFoundException('Inspection not found');
        if (inspection.project.enterpriseId !== userEnterpriseId && role !== client_1.Role.ADMIN) {
            throw new common_1.ForbiddenException('Only the creator or admin can upload files to this inspection');
        }
        const { processScans } = require('./utils/scan-processor.util');
        const processedData = processScans(mpData, rcData);
        const fileBuffer = Buffer.from(JSON.stringify(processedData, null, 2));
        const mpBuffer = Buffer.from(JSON.stringify(mpData, null, 2));
        const rcBuffer = Buffer.from(JSON.stringify(rcData, null, 2));
        const bucket = 'virtual-inspections';
        const s3Path = `inspections/${id}/scans.json`;
        const rawScansS3Path = `inspections/${id}/raw_scans.json`;
        const rawCsvS3Path = `inspections/${id}/raw_csvjson.json`;
        await this.storageService.uploadBuffer(bucket, s3Path, fileBuffer, 'application/json');
        await this.storageService.uploadBuffer(bucket, rawScansS3Path, mpBuffer, 'application/json');
        await this.storageService.uploadBuffer(bucket, rawCsvS3Path, rcBuffer, 'application/json');
        await this.prisma.inspection.update({
            where: { id },
            data: {
                scansJsonUrl: s3Path,
                rawScansJsonUrl: rawScansS3Path,
                rawCsvJsonUrl: rawCsvS3Path
            },
        });
        return { success: true, s3Path, rawScansS3Path, rawCsvS3Path };
    }
    async processGlb(id, userEnterpriseId, role) {
        const inspection = await this.prisma.inspection.findUnique({ where: { id }, include: { project: true } });
        if (!inspection)
            throw new common_1.NotFoundException('Inspection not found');
        if (inspection.project.enterpriseId !== userEnterpriseId && role !== client_1.Role.ADMIN) {
            throw new common_1.ForbiddenException('Only the creator or admin can process this inspection');
        }
        if (!inspection.glbModelUrl) {
            throw new common_1.NotFoundException('No GLB model found to process');
        }
        const execAsync = (0, util_1.promisify)(child_process_1.exec);
        const tmpDir = os.tmpdir();
        const inputPath = path.join(tmpDir, `${id}_input.glb`);
        const outputPath = path.join(tmpDir, `${id}_opt.glb`);
        process.env.PATH = process.env.PATH + ';C:\\Program Files\\KTX-Software\\bin';
        try {
            await this.storageService.downloadFile('virtual-inspections', inspection.glbModelUrl, inputPath);
            const gltfpackPath = path.join(process.cwd(), 'gltfpack.exe');
            let command = `"${gltfpackPath}" -i "${inputPath}" -o "${outputPath}" -cc -mm`;
            try {
                await execAsync(`"${gltfpackPath}" -i "${inputPath}" -o "${outputPath}" -cc -tc -mm`);
            }
            catch (err) {
                console.warn('gltfpack -tc failed (likely missing toktx). Falling back to geometry-only compression:', err.message);
                await execAsync(command);
            }
            const newS3Path = `inspections/${id}/optimized_final.glb`;
            await this.storageService.uploadFile('virtual-inspections', newS3Path, outputPath, 'model/gltf-binary');
            await this.prisma.inspection.update({
                where: { id },
                data: { glbModelUrl: newS3Path },
            });
            return { success: true, optimizedUrl: newS3Path };
        }
        catch (error) {
            console.error('Failed to process GLB:', error);
            throw new common_1.InternalServerErrorException('Failed to optimize GLB model');
        }
        finally {
            if (fs.existsSync(inputPath))
                fs.unlinkSync(inputPath);
            if (fs.existsSync(outputPath))
                fs.unlinkSync(outputPath);
        }
    }
    async createTag(inspectionId, dto, userEnterpriseId, role) {
        const inspection = await this.prisma.inspection.findUnique({ where: { id: inspectionId }, include: { project: true } });
        if (!inspection)
            throw new common_1.NotFoundException('Inspection not found');
        if (inspection.project.enterpriseId !== userEnterpriseId && role !== client_1.Role.ADMIN) {
            throw new common_1.ForbiddenException('Only the creator or admin can add tags');
        }
        return this.prisma.tag.create({
            data: {
                title: dto.title,
                description: dto.description,
                posX: dto.posX,
                posY: dto.posY,
                posZ: dto.posZ,
                inspectionId,
            },
            include: { documents: true },
        });
    }
    async updateTag(inspectionId, tagId, dto, userEnterpriseId, role) {
        const inspection = await this.prisma.inspection.findUnique({ where: { id: inspectionId }, include: { project: true } });
        if (!inspection)
            throw new common_1.NotFoundException('Inspection not found');
        if (inspection.project.enterpriseId !== userEnterpriseId && role !== client_1.Role.ADMIN) {
            throw new common_1.ForbiddenException('Only the creator or admin can edit tags');
        }
        const tag = await this.prisma.tag.findUnique({ where: { id: tagId } });
        if (!tag || tag.inspectionId !== inspectionId)
            throw new common_1.NotFoundException('Tag not found in this inspection');
        return this.prisma.tag.update({
            where: { id: tagId },
            data: dto,
            include: { documents: true },
        });
    }
    async deleteTag(inspectionId, tagId, userEnterpriseId, role) {
        const inspection = await this.prisma.inspection.findUnique({ where: { id: inspectionId }, include: { project: true } });
        if (!inspection)
            throw new common_1.NotFoundException('Inspection not found');
        if (inspection.project.enterpriseId !== userEnterpriseId && role !== client_1.Role.ADMIN) {
            throw new common_1.ForbiddenException('Only the creator or admin can delete tags');
        }
        const tag = await this.prisma.tag.findUnique({ where: { id: tagId } });
        if (!tag || tag.inspectionId !== inspectionId)
            throw new common_1.NotFoundException('Tag not found in this inspection');
        return this.prisma.tag.delete({ where: { id: tagId } });
    }
    async addTagDocument(inspectionId, tagId, dto, userEnterpriseId, role) {
        const inspection = await this.prisma.inspection.findUnique({ where: { id: inspectionId }, include: { project: true } });
        if (!inspection)
            throw new common_1.NotFoundException('Inspection not found');
        if (inspection.project.enterpriseId !== userEnterpriseId && role !== client_1.Role.ADMIN) {
            throw new common_1.ForbiddenException('Only the creator or admin can upload tag documents');
        }
        const tag = await this.prisma.tag.findUnique({ where: { id: tagId } });
        if (!tag || tag.inspectionId !== inspectionId)
            throw new common_1.NotFoundException('Tag not found in this inspection');
        const bucket = 'virtual-inspections';
        const s3Path = `inspections/${inspectionId}/tags/${tagId}/${dto.fileName}`;
        const presignedUrl = await this.storageService.getPresignedPutUrl(bucket, s3Path);
        const document = await this.prisma.tagDocument.create({
            data: {
                title: dto.title,
                fileUrl: s3Path,
                tagId,
            },
        });
        return { presignedUrl, document };
    }
    async deleteTagDocument(inspectionId, tagId, docId, userEnterpriseId, role) {
        const inspection = await this.prisma.inspection.findUnique({ where: { id: inspectionId }, include: { project: true } });
        if (!inspection)
            throw new common_1.NotFoundException('Inspection not found');
        if (inspection.project.enterpriseId !== userEnterpriseId && role !== client_1.Role.ADMIN) {
            throw new common_1.ForbiddenException('Only the creator or admin can delete tag documents');
        }
        const doc = await this.prisma.tagDocument.findUnique({ where: { id: docId } });
        if (!doc || doc.tagId !== tagId)
            throw new common_1.NotFoundException('Document not found on this tag');
        return this.prisma.tagDocument.delete({ where: { id: docId } });
    }
    async createAreaPointer(inspectionId, dto, userEnterpriseId, role) {
        const inspection = await this.prisma.inspection.findUnique({ where: { id: inspectionId }, include: { project: true } });
        if (!inspection)
            throw new common_1.NotFoundException('Inspection not found');
        if (inspection.project.enterpriseId !== userEnterpriseId && role !== client_1.Role.ADMIN) {
            throw new common_1.ForbiddenException('Only the creator or admin can add area pointers');
        }
        return this.prisma.areaPointer.create({
            data: {
                name: dto.name,
                color: dto.color,
                posX: dto.posX,
                posY: dto.posY,
                posZ: dto.posZ,
                inspectionId,
            },
        });
    }
    async updateAreaPointer(inspectionId, pointerId, dto, userEnterpriseId, role) {
        const inspection = await this.prisma.inspection.findUnique({ where: { id: inspectionId }, include: { project: true } });
        if (!inspection)
            throw new common_1.NotFoundException('Inspection not found');
        if (inspection.project.enterpriseId !== userEnterpriseId && role !== client_1.Role.ADMIN) {
            throw new common_1.ForbiddenException('Only the creator or admin can edit area pointers');
        }
        const pointer = await this.prisma.areaPointer.findUnique({ where: { id: pointerId } });
        if (!pointer || pointer.inspectionId !== inspectionId)
            throw new common_1.NotFoundException('Area pointer not found in this inspection');
        return this.prisma.areaPointer.update({
            where: { id: pointerId },
            data: dto,
        });
    }
    async deleteAreaPointer(inspectionId, pointerId, userEnterpriseId, role) {
        const inspection = await this.prisma.inspection.findUnique({ where: { id: inspectionId }, include: { project: true } });
        if (!inspection)
            throw new common_1.NotFoundException('Inspection not found');
        if (inspection.project.enterpriseId !== userEnterpriseId && role !== client_1.Role.ADMIN) {
            throw new common_1.ForbiddenException('Only the creator or admin can delete area pointers');
        }
        const pointer = await this.prisma.areaPointer.findUnique({ where: { id: pointerId } });
        if (!pointer || pointer.inspectionId !== inspectionId)
            throw new common_1.NotFoundException('Area pointer not found in this inspection');
        return this.prisma.areaPointer.delete({ where: { id: pointerId } });
    }
    async createStagingProfile(inspectionId, name, userEnterpriseId, role) {
        const inspection = await this.prisma.inspection.findUnique({ where: { id: inspectionId }, include: { project: true } });
        if (!inspection)
            throw new common_1.NotFoundException('Inspection not found');
        if (inspection.project.enterpriseId !== userEnterpriseId && role !== client_1.Role.ADMIN) {
            throw new common_1.ForbiddenException('Only the creator or admin can add staging profiles');
        }
        return this.prisma.stagingProfile.create({
            data: {
                name,
                inspectionId,
            },
        });
    }
    async getStagingProfile(inspectionId, profileId) {
        const profile = await this.prisma.stagingProfile.findUnique({
            where: { id: profileId },
            include: {
                stagedItems: true,
                bakedPanoramas: true
            },
        });
        if (!profile || profile.inspectionId !== inspectionId) {
            throw new common_1.NotFoundException('Staging profile not found in this inspection');
        }
        return profile;
    }
    async saveStagedItems(inspectionId, profileId, items, userEnterpriseId, role) {
        const profile = await this.getStagingProfile(inspectionId, profileId);
        const inspection = await this.prisma.inspection.findUnique({ where: { id: inspectionId }, include: { project: true } });
        if (inspection.project.enterpriseId !== userEnterpriseId && role !== client_1.Role.ADMIN) {
            throw new common_1.ForbiddenException('Only the creator or admin can modify staging profiles');
        }
        await this.prisma.stagedItem.deleteMany({
            where: { stagingProfileId: profileId },
        });
        if (items.length > 0) {
            await this.prisma.stagedItem.createMany({
                data: items.map(item => ({
                    stagingProfileId: profileId,
                    isPolyHaven: item.isPolyHaven,
                    isSketchfab: item.isSketchfab,
                    polyHavenId: item.polyHavenId,
                    sketchfabId: item.sketchfabId,
                    type: item.type,
                    color: item.color,
                    dimensions: item.dimensions,
                    positionX: item.position[0],
                    positionY: item.position[1],
                    positionZ: item.position[2],
                    rotationX: item.rotation[0],
                    rotationY: item.rotation[1],
                    rotationZ: item.rotation[2],
                    scaleX: item.scale[0],
                    scaleY: item.scale[1],
                    scaleZ: item.scale[2],
                })),
            });
        }
        return this.getStagingProfile(inspectionId, profileId);
    }
    async saveBakedPanoramas(inspectionId, profileId, panoramas, userEnterpriseId, role) {
        const profile = await this.getStagingProfile(inspectionId, profileId);
        const inspection = await this.prisma.inspection.findUnique({ where: { id: inspectionId }, include: { project: true } });
        if (inspection.project.enterpriseId !== userEnterpriseId && role !== client_1.Role.ADMIN) {
            throw new common_1.ForbiddenException('Only the creator or admin can modify staging profiles');
        }
        for (const p of panoramas) {
            await this.prisma.bakedPanorama.deleteMany({
                where: {
                    stagingProfileId: profileId,
                    scanId: p.scanId,
                    face: p.face,
                },
            });
            await this.prisma.bakedPanorama.create({
                data: {
                    stagingProfileId: profileId,
                    scanId: p.scanId,
                    face: p.face,
                    imageUrl: p.imageUrl,
                },
            });
        }
        return this.getStagingProfile(inspectionId, profileId);
    }
};
exports.InspectionsService = InspectionsService;
exports.InspectionsService = InspectionsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        storage_service_1.StorageService])
], InspectionsService);
//# sourceMappingURL=inspections.service.js.map