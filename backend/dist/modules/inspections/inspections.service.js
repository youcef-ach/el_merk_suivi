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
const zlib = require("zlib");
const THREE = require("three");
const child_process_1 = require("child_process");
const util_1 = require("util");
const client_1 = require("@prisma/client");
let InspectionsService = class InspectionsService {
    constructor(prisma, storageService) {
        this.prisma = prisma;
        this.storageService = storageService;
    }
    async create(projectId, createInspectionDto, userEnterpriseId) {
        const data = {
            ...createInspectionDto,
            projectId,
        };
        if (createInspectionDto.surveyDate) {
            data.surveyDate = new Date(createInspectionDto.surveyDate);
        }
        return this.prisma.inspection.create({ data });
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
                surveyReports: true,
                crossSections: true,
                siteMeasurements: true,
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
        try {
            const inspection = await this.prisma.inspection.findUnique({ where: { id }, include: { project: true } });
            if (!inspection)
                throw new common_1.NotFoundException('Inspection not found');
            if (inspection.project.enterpriseId !== userEnterpriseId && role !== client_1.Role.ADMIN) {
                throw new common_1.ForbiddenException('Only the creator or admin can upload files to this inspection');
            }
            const bucket = 'virtual-inspections';
            const s3Path = `inspections/${id}/${fileName}`;
            const presignedUrl = await this.storageService.getPresignedPutUrl(bucket, s3Path);
            if (fileName && fileName.endsWith('.glb')) {
                await this.prisma.inspection.update({
                    where: { id },
                    data: { glbModelUrl: s3Path },
                });
            }
            else if (fileName && fileName.endsWith('scans.json')) {
                await this.prisma.inspection.update({
                    where: { id },
                    data: { scansJsonUrl: s3Path },
                });
            }
            return { presignedUrl, expectedPath: s3Path };
        }
        catch (error) {
            console.error('DEBUG: getUploadUrl error ->', error);
            throw error;
        }
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
    async updateSurveyMeta(inspectionId, dto, userId, role) {
        const inspection = await this.prisma.inspection.findUnique({
            where: { id: inspectionId },
            include: { project: true },
        });
        if (!inspection)
            throw new common_1.NotFoundException('Inspection not found');
        const updateData = { ...dto };
        if (dto.surveyDate) {
            updateData.surveyDate = new Date(dto.surveyDate);
        }
        return this.prisma.inspection.update({
            where: { id: inspectionId },
            data: updateData,
            include: {
                surveyReports: true,
                crossSections: true,
                siteMeasurements: true,
            },
        });
    }
    async createSurveyReport(inspectionId, dto, userId, role) {
        const inspection = await this.prisma.inspection.findUnique({ where: { id: inspectionId } });
        if (!inspection)
            throw new common_1.NotFoundException('Inspection not found');
        return this.prisma.surveyReport.create({
            data: {
                inspectionId,
                title: dto.title,
                reportType: dto.reportType,
                summary: dto.summary,
                fileUrl: dto.fileUrl,
            },
        });
    }
    async getSurveyReports(inspectionId, userId, role) {
        return this.prisma.surveyReport.findMany({
            where: { inspectionId },
            orderBy: { createdAt: 'desc' },
        });
    }
    async deleteSurveyReport(inspectionId, reportId, userId, role) {
        return this.prisma.surveyReport.delete({
            where: { id: reportId },
        });
    }
    async createCrossSection(inspectionId, dto, userId, role) {
        const inspection = await this.prisma.inspection.findUnique({ where: { id: inspectionId } });
        if (!inspection)
            throw new common_1.NotFoundException('Inspection not found');
        return this.prisma.crossSection.create({
            data: {
                inspectionId,
                name: dto.name,
                startPoint: dto.startPoint,
                endPoint: dto.endPoint,
                sampleData: dto.sampleData,
                length: dto.length,
                minElev: dto.minElev,
                maxElev: dto.maxElev,
                slope: dto.slope,
            },
        });
    }
    async getCrossSections(inspectionId, userId, role) {
        return this.prisma.crossSection.findMany({
            where: { inspectionId },
            orderBy: { createdAt: 'desc' },
        });
    }
    async deleteCrossSection(inspectionId, sectionId, userId, role) {
        return this.prisma.crossSection.delete({
            where: { id: sectionId },
        });
    }
    async createSiteMeasurement(inspectionId, dto, userId, role) {
        const inspection = await this.prisma.inspection.findUnique({ where: { id: inspectionId } });
        if (!inspection)
            throw new common_1.NotFoundException('Inspection not found');
        return this.prisma.siteMeasurement.create({
            data: {
                inspectionId,
                type: dto.type,
                points: dto.points,
                values: dto.values,
                label: dto.label,
            },
        });
    }
    async getSiteMeasurements(inspectionId, userId, role) {
        return this.prisma.siteMeasurement.findMany({
            where: { inspectionId },
            orderBy: { createdAt: 'desc' },
        });
    }
    async deleteSiteMeasurement(inspectionId, measurementId, userId, role) {
        return this.prisma.siteMeasurement.delete({
            where: { id: measurementId },
        });
    }
    async processTileset(id, userEnterpriseId, role) {
        const inspection = await this.prisma.inspection.findUnique({ where: { id }, include: { project: true } });
        if (!inspection)
            throw new common_1.NotFoundException('Inspection not found');
        if (inspection.project.enterpriseId !== userEnterpriseId && role !== client_1.Role.ADMIN) {
            throw new common_1.ForbiddenException('Only the creator or admin can process 3D tiles for this inspection');
        }
        const bucket = 'virtual-inspections';
        const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tileset-'));
        const zipPath = path.join(tempDir, 'tileset.zip');
        try {
            await this.storageService.downloadFile(bucket, `inspections/${id}/tileset.zip`, zipPath);
            const AdmZip = require('adm-zip');
            const zip = new AdmZip(zipPath);
            const extractDir = path.join(tempDir, 'extracted');
            zip.extractAllTo(extractDir, true);
            let rootJsonDir = extractDir;
            let rootJsonName = 'tileset.json';
            let foundJsonPath = null;
            const searchForTilesetJson = (dir) => {
                const entries = fs.readdirSync(dir, { withFileTypes: true });
                for (const entry of entries) {
                    const full = path.join(dir, entry.name);
                    if (!entry.isDirectory() && entry.name.toLowerCase().endsWith('.json')) {
                        try {
                            const content = fs.readFileSync(full, 'utf-8');
                            const parsed = JSON.parse(content);
                            if (parsed.asset || parsed.root || parsed.geometricError !== undefined) {
                                foundJsonPath = full;
                                rootJsonDir = dir;
                                rootJsonName = entry.name;
                                return;
                            }
                        }
                        catch (e) {
                        }
                    }
                    if (entry.isDirectory()) {
                        searchForTilesetJson(full);
                        if (foundJsonPath)
                            return;
                    }
                }
            };
            searchForTilesetJson(extractDir);
            if (!foundJsonPath) {
                const findAnyJson = (dir) => {
                    const entries = fs.readdirSync(dir, { withFileTypes: true });
                    for (const entry of entries) {
                        const full = path.join(dir, entry.name);
                        if (!entry.isDirectory() && entry.name.toLowerCase().endsWith('.json')) {
                            foundJsonPath = full;
                            rootJsonDir = dir;
                            rootJsonName = entry.name;
                            return;
                        }
                        if (entry.isDirectory()) {
                            findAnyJson(full);
                            if (foundJsonPath)
                                return;
                        }
                    }
                };
                findAnyJson(extractDir);
            }
            console.log(`[processTileset] Located 3D Tiles root at: ${rootJsonDir}, primary file: ${rootJsonName}`);
            const uploadRecursive = async (currDir, relPath = '') => {
                const entries = fs.readdirSync(currDir, { withFileTypes: true });
                for (const entry of entries) {
                    const fullPath = path.join(currDir, entry.name);
                    const s3Rel = relPath ? `${relPath}/${entry.name}` : entry.name;
                    if (entry.isDirectory()) {
                        await uploadRecursive(fullPath, s3Rel);
                    }
                    else {
                        if (entry.name.endsWith('.b3dm') || entry.name.endsWith('.pnts') || entry.name.endsWith('.i3dm')) {
                            try {
                                const buf = fs.readFileSync(fullPath);
                                if (buf.length >= 2 && buf[0] === 0x1f && buf[1] === 0x8b) {
                                    const decompressed = zlib.gunzipSync(buf);
                                    fs.writeFileSync(fullPath, decompressed);
                                    console.log(`[processTileset] Auto-decompressed gzip tile: ${entry.name} (${buf.length} -> ${decompressed.length} bytes)`);
                                }
                            }
                            catch (e) {
                                console.warn(`[processTileset] Gzip check error on ${entry.name}:`, e.message);
                            }
                        }
                        if (entry.name.endsWith('.json')) {
                            try {
                                const buf = fs.readFileSync(fullPath);
                                const json = JSON.parse(buf.toString('utf-8'));
                                if (json.root) {
                                    const normalizeNode = (node) => {
                                        if (!node)
                                            return;
                                        if (node.content) {
                                            if (node.content.url && !node.content.uri) {
                                                node.content.uri = node.content.url;
                                            }
                                        }
                                        if (Array.isArray(node.children)) {
                                            node.children.forEach(normalizeNode);
                                        }
                                    };
                                    normalizeNode(json.root);
                                    fs.writeFileSync(fullPath, JSON.stringify(json, null, 2));
                                }
                            }
                            catch (e) { }
                        }
                        const s3Dest = `inspections/${id}/tileset/${s3Rel}`;
                        let contentType = 'application/octet-stream';
                        if (entry.name.endsWith('.json'))
                            contentType = 'application/json';
                        else if (entry.name.endsWith('.b3dm'))
                            contentType = 'application/octet-stream';
                        else if (entry.name.endsWith('.glb'))
                            contentType = 'model/gltf-binary';
                        else if (entry.name.endsWith('.pnts'))
                            contentType = 'application/octet-stream';
                        await this.storageService.uploadFile(bucket, s3Dest, fullPath, contentType);
                        if (currDir === rootJsonDir && entry.name === rootJsonName && rootJsonName !== 'tileset.json') {
                            await this.storageService.uploadFile(bucket, `inspections/${id}/tileset/tileset.json`, fullPath, 'application/json');
                        }
                    }
                }
            };
            await uploadRecursive(rootJsonDir);
            let datum = null;
            try {
                const rootJsonFullPath = path.join(rootJsonDir, rootJsonName);
                if (fs.existsSync(rootJsonFullPath)) {
                    const raw = fs.readFileSync(rootJsonFullPath, 'utf-8');
                    const parsed = JSON.parse(raw);
                    datum = await this.computeTilesetDatum(parsed, 'rotX_neg90', rootJsonDir);
                    if (datum) {
                        console.log(`[processTileset] Option A Active: groundOffset=${datum.groundOffset}m ASL (source: ${datum.elevationSource || 'LOCAL'}), meshSnapOffset=${datum.meshSnapOffset}m, lowestPoint=${datum.lowestPoint ? `(${datum.lowestPoint.x}, ${datum.lowestPoint.y}, ${datum.lowestPoint.z})` : 'pending client mesh'}`);
                    }
                }
            }
            catch (datumErr) {
                console.warn(`[processTileset] Could not compute datum from tileset JSON:`, datumErr.message);
            }
            const relativeTilesetUrl = `inspections/${id}/tileset/${rootJsonName}`;
            const existingMeta = inspection.orthoBounds || {};
            const updatedBounds = {
                ...existingMeta,
                ...(datum ? {
                    groundOffset: datum.groundOffset,
                    groundAsl: datum.groundAsl,
                    meshSnapOffset: datum.meshSnapOffset,
                    surfaceCenterPoint: datum.surfaceCenterPoint,
                    lowestPoint: datum.surfaceCenterPoint,
                    elevationRange: datum.elevationRange,
                    minYRaw: datum.minYRaw,
                    maxYRaw: datum.maxYRaw,
                    elevationSource: datum.elevationSource,
                } : {}),
            };
            await this.prisma.inspection.update({
                where: { id },
                data: {
                    tilesetUrl: relativeTilesetUrl,
                    orthoBounds: updatedBounds,
                    ...(datum?.gps ? {
                        latitude: datum.gps.lat,
                        longitude: datum.gps.lon,
                    } : {}),
                    ...(datum?.groundAsl ? {
                        altitude: datum.groundAsl,
                    } : {}),
                    ...(datum ? {
                        dsmMinElevation: datum.elevationRange.min,
                        dsmMaxElevation: datum.elevationRange.max,
                    } : {}),
                },
            });
            console.log(`[processTileset] 3D Tileset unpacked successfully. tilesetUrl = ${relativeTilesetUrl}`);
            return { status: 'SUCCESS', tilesetUrl: relativeTilesetUrl, datum };
        }
        catch (err) {
            console.error(`[processTileset] Error:`, err);
            throw new common_1.InternalServerErrorException(`Failed to unpack 3D Tileset: ${err.message}`);
        }
        finally {
            fs.rmSync(tempDir, { recursive: true, force: true });
        }
    }
    async computeTilesetDatum(json, orientation = 'rotX_neg90', rootJsonDir) {
        if (!json || !json.root)
            return null;
        const root = json.root;
        const rawTransform = root.transform || [
            1, 0, 0, 0,
            0, 1, 0, 0,
            0, 0, 1, 0,
            0, 0, 0, 1,
        ];
        let gps = null;
        if (rawTransform && rawTransform.length === 16) {
            const x = rawTransform[12];
            const y = rawTransform[13];
            const z = rawTransform[14];
            const mag = Math.hypot(x, y, z);
            if (mag > 6000000 && mag < 6500000) {
                const a = 6378137.0;
                const b = 6356752.314245;
                const e2 = 1 - (b * b) / (a * a);
                const ep2 = (a * a) / (b * b) - 1;
                const p = Math.hypot(x, y);
                const theta = Math.atan2(z * a, p * b);
                const lon = (Math.atan2(y, x) * 180) / Math.PI;
                const lat = (Math.atan2(z + ep2 * b * Math.pow(Math.sin(theta), 3), p - e2 * a * Math.pow(Math.cos(theta), 3)) * 180) / Math.PI;
                gps = { lat: Number(lat.toFixed(6)), lon: Number(lon.toFixed(6)) };
            }
        }
        if (!gps && root.boundingVolume?.region && Array.isArray(root.boundingVolume.region)) {
            const [west, south, east, north] = root.boundingVolume.region;
            gps = {
                lat: Number((((south + north) * 0.5 * 180) / Math.PI).toFixed(6)),
                lon: Number((((west + east) * 0.5 * 180) / Math.PI).toFixed(6)),
            };
        }
        let groundAsl = null;
        if (gps) {
            try {
                const res = await fetch(`https://api.open-meteo.com/v1/elevation?latitude=${gps.lat}&longitude=${gps.lon}`, {
                    signal: AbortSignal.timeout(5000)
                });
                if (res.ok) {
                    const demData = await res.json();
                    if (Array.isArray(demData?.elevation) && typeof demData.elevation[0] === 'number') {
                        groundAsl = Number(demData.elevation[0].toFixed(2));
                        console.log(`[computeTilesetDatum] Option A Active: Auto-detected Copernicus DEM Elevation at (${gps.lat}°, ${gps.lon}°): ${groundAsl}m ASL`);
                    }
                }
            }
            catch (demErr) {
                console.warn(`[computeTilesetDatum] Satellite DEM elevation lookup notice:`, demErr.message);
            }
        }
        const m4Root = new THREE.Matrix4().fromArray(rawTransform);
        const invRoot = m4Root.clone().invert();
        let rotMat = new THREE.Matrix4().identity();
        if (orientation === 'rotX_neg90') {
            rotMat.makeRotationX(-Math.PI / 2);
        }
        else if (orientation === 'rotX_90') {
            rotMat.makeRotationX(Math.PI / 2);
        }
        const finalMat = new THREE.Matrix4().multiplyMatrices(rotMat, invRoot);
        const box = root.boundingVolume?.box;
        if (!box || box.length !== 12)
            return null;
        const center = new THREE.Vector3(box[0], box[1], box[2]);
        const xAxis = new THREE.Vector3(box[3], box[4], box[5]);
        const yAxis = new THREE.Vector3(box[6], box[7], box[8]);
        const zAxis = new THREE.Vector3(box[9], box[10], box[11]);
        let minY = Infinity;
        let maxY = -Infinity;
        for (const sx of [-1, 1]) {
            for (const sy of [-1, 1]) {
                for (const sz of [-1, 1]) {
                    const pt = center.clone()
                        .addScaledVector(xAxis, sx)
                        .addScaledVector(yAxis, sy)
                        .addScaledVector(zAxis, sz);
                    pt.applyMatrix4(m4Root);
                    pt.applyMatrix4(finalMat);
                    if (pt.y < minY) {
                        minY = pt.y;
                    }
                    if (pt.y > maxY) {
                        maxY = pt.y;
                    }
                }
            }
        }
        if (!isFinite(minY))
            return null;
        const meshSnapOffset = -minY;
        const finalGroundAsl = groundAsl ?? Number(meshSnapOffset.toFixed(3));
        const heightSpan = maxY - minY;
        return {
            groundOffset: finalGroundAsl,
            groundAsl: finalGroundAsl,
            meshSnapOffset: Number(meshSnapOffset.toFixed(3)),
            minYRaw: Number(minY.toFixed(3)),
            maxYRaw: Number(maxY.toFixed(3)),
            surfaceCenterPoint: {
                x: 0.0,
                y: Number(((maxY + minY) * 0.5 + meshSnapOffset).toFixed(3)),
                z: 0.0,
            },
            elevationRange: {
                min: Number((-heightSpan * 0.5).toFixed(3)),
                max: Number((heightSpan * 0.5).toFixed(3)),
            },
            gps,
            elevationSource: groundAsl ? 'COPERNICUS_DEM_30M' : 'LOCAL_BBOX',
        };
    }
    checkGlbHasKtx2(filePath) {
        try {
            const fd = fs.openSync(filePath, 'r');
            const header = Buffer.alloc(12);
            fs.readSync(fd, header, 0, 12, 0);
            const magic = header.readUInt32LE(0);
            if (magic !== 0x46546c67) {
                fs.closeSync(fd);
                return false;
            }
            const chunkHeader = Buffer.alloc(8);
            fs.readSync(fd, chunkHeader, 0, 8, 12);
            const jsonLength = chunkHeader.readUInt32LE(0);
            const readLen = Math.min(jsonLength, 65536);
            const jsonBuffer = Buffer.alloc(readLen);
            fs.readSync(fd, jsonBuffer, 0, readLen, 20);
            fs.closeSync(fd);
            return jsonBuffer.toString('utf8').includes('KHR_texture_basisu');
        }
        catch (_) {
            return false;
        }
    }
    getGlbVertexCount(filePath) {
        try {
            const fd = fs.openSync(filePath, 'r');
            const header = Buffer.alloc(12);
            fs.readSync(fd, header, 0, 12, 0);
            if (header.readUInt32LE(0) !== 0x46546c67) {
                fs.closeSync(fd);
                return 500000;
            }
            const chunkHeader = Buffer.alloc(8);
            fs.readSync(fd, chunkHeader, 0, 8, 12);
            const jsonLength = chunkHeader.readUInt32LE(0);
            const readLen = Math.min(jsonLength, 65536);
            const jsonBuffer = Buffer.alloc(readLen);
            fs.readSync(fd, jsonBuffer, 0, readLen, 20);
            fs.closeSync(fd);
            const jsonStr = jsonBuffer.toString('utf8');
            const gltf = JSON.parse(jsonStr);
            let total = 0;
            if (gltf.meshes) {
                for (const m of gltf.meshes) {
                    for (const p of m.primitives || []) {
                        if (p.attributes && p.attributes.POSITION !== undefined && gltf.accessors) {
                            total += gltf.accessors[p.attributes.POSITION]?.count || 0;
                        }
                    }
                }
            }
            return total > 0 ? total : 500000;
        }
        catch (_) {
            return 500000;
        }
    }
    getGlbTextureCount(filePath) {
        try {
            const fd = fs.openSync(filePath, 'r');
            const header = Buffer.alloc(12);
            fs.readSync(fd, header, 0, 12, 0);
            if (header.readUInt32LE(0) !== 0x46546c67) {
                fs.closeSync(fd);
                return 1;
            }
            const chunkHeader = Buffer.alloc(8);
            fs.readSync(fd, chunkHeader, 0, 8, 12);
            const jsonLength = chunkHeader.readUInt32LE(0);
            const readLen = Math.min(jsonLength, 65536);
            const jsonBuffer = Buffer.alloc(readLen);
            fs.readSync(fd, jsonBuffer, 0, readLen, 20);
            fs.closeSync(fd);
            const jsonStr = jsonBuffer.toString('utf8');
            const texturesMatch = jsonStr.match(/"textures"\s*:\s*\[([^\]]*)\]/);
            if (texturesMatch) {
                const count = (texturesMatch[1].match(/\{/g) || []).length;
                return count > 0 ? count : 1;
            }
            const imagesMatch = jsonStr.match(/"images"\s*:\s*\[([^\]]*)\]/);
            if (imagesMatch) {
                const count = (imagesMatch[1].match(/\{/g) || []).length;
                return count > 0 ? count : 1;
            }
            return 1;
        }
        catch (_) {
            return 1;
        }
    }
    async processGlb(id, userEnterpriseId, role, targetFileName, compressionMode = 'uastc', onProgress) {
        const inspection = await this.prisma.inspection.findUnique({ where: { id }, include: { project: true } });
        if (!inspection)
            throw new common_1.NotFoundException('Inspection not found');
        if (inspection.project.enterpriseId !== userEnterpriseId && role !== client_1.Role.ADMIN) {
            throw new common_1.ForbiddenException('Only the creator or admin can process 3D models for this inspection');
        }
        const bucket = 'virtual-inspections';
        const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'glb-opt-'));
        try {
            let downloadedName = targetFileName;
            if (!downloadedName) {
                if (inspection.glbModelUrl) {
                    downloadedName = path.basename(inspection.glbModelUrl);
                }
                else {
                    downloadedName = 'model.glb';
                }
            }
            const downloadedPath = path.join(tempDir, downloadedName);
            const s3Source = `inspections/${id}/${downloadedName}`;
            if (onProgress)
                await onProgress(15, `Downloading source model ${downloadedName}...`);
            await this.storageService.downloadFile(bucket, s3Source, downloadedPath);
            let sourceGlbPath;
            if (downloadedName.toLowerCase().endsWith('.zip')) {
                console.log(`[processGlb] Extracting ZIP model archive: ${downloadedPath}`);
                const AdmZip = require('adm-zip');
                const zip = new AdmZip(downloadedPath);
                const extractDir = path.join(tempDir, 'unzipped');
                zip.extractAllTo(extractDir, true);
                let foundObj = null;
                let foundGlb = null;
                const findModel = (dir) => {
                    const entries = fs.readdirSync(dir, { withFileTypes: true });
                    for (const entry of entries) {
                        const full = path.join(dir, entry.name);
                        if (entry.isDirectory()) {
                            findModel(full);
                        }
                        else {
                            const lower = entry.name.toLowerCase();
                            if (lower.endsWith('.obj') && !foundObj)
                                foundObj = full;
                            if ((lower.endsWith('.glb') || lower.endsWith('.gltf')) && !foundGlb)
                                foundGlb = full;
                        }
                    }
                };
                findModel(extractDir);
                if (foundObj) {
                    console.log(`[processGlb] Converting extracted OBJ to GLB: ${foundObj}`);
                    const obj2gltf = require('obj2gltf');
                    const tempGlbBuffer = await obj2gltf(foundObj, { binary: true });
                    sourceGlbPath = path.join(tempDir, 'converted.glb');
                    fs.writeFileSync(sourceGlbPath, tempGlbBuffer);
                }
                else if (foundGlb) {
                    sourceGlbPath = foundGlb;
                }
                else {
                    throw new Error('No .obj or .glb found inside uploaded ZIP archive');
                }
            }
            else if (downloadedName.toLowerCase().endsWith('.obj')) {
                console.log(`[processGlb] Converting OBJ to GLB: ${downloadedPath}`);
                const obj2gltf = require('obj2gltf');
                const tempGlbBuffer = await obj2gltf(downloadedPath, { binary: true });
                sourceGlbPath = path.join(tempDir, 'converted.glb');
                fs.writeFileSync(sourceGlbPath, tempGlbBuffer);
            }
            else {
                sourceGlbPath = downloadedPath;
            }
            if (onProgress)
                await onProgress(35, 'Analyzing 3D geometry density and texture maps...');
            const finalGlbPath = path.join(tempDir, 'model.glb');
            const isAlreadyKtx2 = this.checkGlbHasKtx2(sourceGlbPath);
            const vertexCount = this.getGlbVertexCount(sourceGlbPath);
            const textureCount = this.getGlbTextureCount(sourceGlbPath);
            const maxMasterVertices = 1500000;
            const maxMobileVertices = 400000;
            let masterSimplificationRatio = 1.0;
            if (vertexCount > maxMasterVertices) {
                masterSimplificationRatio = Math.max(0.1, Number((maxMasterVertices / vertexCount).toFixed(2)));
            }
            let mobileSimplificationRatio = Math.min(0.35, Number((maxMobileVertices / vertexCount).toFixed(2)));
            if (mobileSimplificationRatio < 0.05)
                mobileSimplificationRatio = 0.05;
            const masterTexLimit = textureCount <= 2 ? '2048' : '1024';
            const mobileTexLimit = textureCount <= 2 ? '1024' : '512';
            console.log(`[processGlb] source: ${sourceGlbPath}, isAlreadyKtx2: ${isAlreadyKtx2}, vertices: ${vertexCount}, textures: ${textureCount}, decimation: [master: ${masterSimplificationRatio}, mobile: ${mobileSimplificationRatio}], texLimits: [master: ${masterTexLimit}px, mobile: ${mobileTexLimit}px]`);
            let gltfpackBin = 'gltfpack';
            if (process.platform === 'win32') {
                const localWin = path.resolve(process.cwd(), 'gltfpack.exe');
                if (fs.existsSync(localWin))
                    gltfpackBin = localWin;
            }
            else {
                if (fs.existsSync('/usr/local/bin/gltfpack'))
                    gltfpackBin = '/usr/local/bin/gltfpack';
            }
            let usedGltfpack = false;
            if (onProgress)
                await onProgress(50, 'Encoding Basis Universal KTX2 textures and Draco geometry...');
            const hasGltfpack = fs.existsSync(gltfpackBin) || gltfpackBin === 'gltfpack';
            if (hasGltfpack) {
                try {
                    const { execFile } = require('child_process');
                    const util = require('util');
                    const execFilePromise = util.promisify(execFile);
                    const args = ['-i', sourceGlbPath, '-o', finalGlbPath, '-cc', '-mm'];
                    if (masterSimplificationRatio < 1.0) {
                        args.push('-si', String(masterSimplificationRatio), '-slb');
                    }
                    if (!isAlreadyKtx2) {
                        args.push('-tc', '-tl', masterTexLimit, '-tq', '6', '-tj', '2');
                        console.log(`[processGlb] Compressing textures with KTX2 BasisU (max ${masterTexLimit}px, q=6, threads=2) + Mesh Merging...`);
                    }
                    else {
                        console.log(`[processGlb] Model already has KTX2 textures. Preserving textures, merging meshes and optimizing geometry.`);
                    }
                    const { stdout, stderr } = await execFilePromise(gltfpackBin, args, { maxBuffer: 100 * 1024 * 1024 });
                    if (stdout)
                        console.log(`[gltfpack] ${stdout}`);
                    if (stderr)
                        console.warn(`[gltfpack warn] ${stderr}`);
                    if (fs.existsSync(finalGlbPath) && fs.statSync(finalGlbPath).size > 0) {
                        usedGltfpack = true;
                    }
                    const lod1GlbPath = path.join(tempDir, 'model_lod1.glb');
                    const lod1Args = ['-i', sourceGlbPath, '-o', lod1GlbPath, '-si', String(mobileSimplificationRatio), '-slb', '-cc', '-mm'];
                    if (!isAlreadyKtx2) {
                        lod1Args.push('-tc', '-tl', mobileTexLimit, '-tq', '5', '-tj', '2');
                    }
                    try {
                        if (onProgress)
                            await onProgress(75, 'Generating 35% decimated mobile LOD1 mesh...');
                        console.log(`[processGlb] Generating automated Mobile LOD1 decimated mesh (-si ${mobileSimplificationRatio} -slb, max ${mobileTexLimit}px)...`);
                        const { stdout: lod1Out } = await execFilePromise(gltfpackBin, lod1Args, { maxBuffer: 100 * 1024 * 1024 });
                        if (lod1Out)
                            console.log(`[gltfpack LOD1] ${lod1Out}`);
                    }
                    catch (lodErr) {
                        console.warn(`[processGlb] Warning: Failed to generate model_lod1.glb:`, lodErr.message);
                    }
                }
                catch (gpErr) {
                    console.warn(`[processGlb] gltfpack failed, falling back to @gltf-transform:`, gpErr.message);
                }
            }
            if (!usedGltfpack) {
                console.log(`[processGlb] Optimizing & Draco compressing via @gltf-transform: ${sourceGlbPath}`);
                const { NodeIO } = require('@gltf-transform/core');
                const { KHRONOS_EXTENSIONS } = require('@gltf-transform/extensions');
                const { weld, dedup, prune, textureCompress, draco } = require('@gltf-transform/functions');
                const draco3d = require('draco3dgltf');
                const sharp = require('sharp');
                const encoder = await draco3d.createEncoderModule();
                const decoder = await draco3d.createDecoderModule();
                const io = new NodeIO()
                    .registerExtensions(KHRONOS_EXTENSIONS)
                    .registerDependencies({
                    'draco3d.encoder': encoder,
                    'draco3d.decoder': decoder,
                });
                const document = await io.read(sourceGlbPath);
                await document.transform(dedup(), prune(), weld({ tolerance: 0.0001 }), textureCompress({ encoder: sharp, resize: [1024, 1024] }), draco({ method: 'edgebreaker' }));
                await io.write(finalGlbPath, document);
            }
            const optimizedSize = fs.statSync(finalGlbPath).size;
            console.log(`[processGlb] Optimization complete! Final model size: ${(optimizedSize / 1024 / 1024).toFixed(2)} MB`);
            if (onProgress)
                await onProgress(90, 'Uploading optimized 3D Digital Twin models to storage...');
            const s3Dest = `inspections/${id}/model.glb`;
            await this.storageService.uploadFile(bucket, s3Dest, finalGlbPath, 'model/gltf-binary');
            const lod1GlbPath = path.join(tempDir, 'model_lod1.glb');
            if (fs.existsSync(lod1GlbPath) && fs.statSync(lod1GlbPath).size > 0) {
                const lod1S3Dest = `inspections/${id}/model_lod1.glb`;
                await this.storageService.uploadFile(bucket, lod1S3Dest, lod1GlbPath, 'model/gltf-binary');
                console.log(`[processGlb] Uploaded mobile model_lod1.glb (${(fs.statSync(lod1GlbPath).size / 1024 / 1024).toFixed(2)} MB) to ${lod1S3Dest}`);
            }
            await this.prisma.inspection.update({
                where: { id },
                data: { glbModelUrl: s3Dest },
            });
            return {
                status: 'SUCCESS',
                glbModelUrl: s3Dest,
                fileSizeMb: parseFloat((optimizedSize / 1024 / 1024).toFixed(2)),
            };
        }
        catch (err) {
            console.error(`[processGlb] Error processing 3D model:`, err);
            throw new common_1.InternalServerErrorException(`Failed to process 3D model: ${err.message}`);
        }
        finally {
            fs.rmSync(tempDir, { recursive: true, force: true });
        }
    }
    async processPanoramas(id, userEnterpriseId, role, onProgress) {
        const inspection = await this.prisma.inspection.findUnique({ where: { id }, include: { project: true } });
        if (!inspection)
            throw new common_1.NotFoundException('Inspection not found');
        if (inspection.project.enterpriseId !== userEnterpriseId && role !== client_1.Role.ADMIN) {
            throw new common_1.ForbiddenException('Only the creator or admin can process panoramas for this inspection');
        }
        const bucket = 'virtual-inspections';
        const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'panos-'));
        const zipPath = path.join(tempDir, 'panoramas.zip');
        try {
            await this.storageService.downloadFile(bucket, `inspections/${id}/panoramas.zip`, zipPath);
            const AdmZip = require('adm-zip');
            const sharp = require('sharp');
            const execPromise = (0, util_1.promisify)(child_process_1.exec);
            const zip = new AdmZip(zipPath);
            const extractDir = path.join(tempDir, 'extracted');
            zip.extractAllTo(extractDir, true);
            if (onProgress)
                await onProgress(10, 'Unpacking scan archives and discovering stations...');
            const outputDir = path.join(tempDir, 'output');
            const cubemapsDir = path.join(outputDir, 'cubemaps');
            const equirectDir = path.join(outputDir, 'equirect');
            const equirectLowDir = path.join(outputDir, 'equirect_low');
            const ktx2Dir = path.join(outputDir, 'ktx2');
            fs.mkdirSync(cubemapsDir, { recursive: true });
            fs.mkdirSync(equirectDir, { recursive: true });
            fs.mkdirSync(equirectLowDir, { recursive: true });
            fs.mkdirSync(ktx2Dir, { recursive: true });
            let uploadedCount = 0;
            const uploadRecursive = async (currDir, relPath = '') => {
                const entries = fs.readdirSync(currDir, { withFileTypes: true });
                for (const entry of entries) {
                    const fullPath = path.join(currDir, entry.name);
                    const s3Rel = relPath ? `${relPath}/${entry.name}` : entry.name;
                    if (entry.isDirectory()) {
                        await uploadRecursive(fullPath, s3Rel);
                    }
                    else {
                        let contentType = 'image/jpeg';
                        const lower = entry.name.toLowerCase();
                        if (lower.endsWith('.png'))
                            contentType = 'image/png';
                        else if (lower.endsWith('.json'))
                            contentType = 'application/json';
                        else if (lower.endsWith('.ktx2'))
                            contentType = 'image/ktx2';
                        const s3Dest = `inspections/${id}/${s3Rel}`;
                        await this.storageService.uploadFile(bucket, s3Dest, fullPath, contentType);
                        uploadedCount++;
                    }
                }
            };
            const allExtractedFiles = [];
            const findFilesRecursive = (curr) => {
                const entries = fs.readdirSync(curr, { withFileTypes: true });
                for (const entry of entries) {
                    const full = path.join(curr, entry.name);
                    if (entry.isDirectory()) {
                        findFilesRecursive(full);
                    }
                    else {
                        allExtractedFiles.push({ name: entry.name, fullPath: full });
                    }
                }
            };
            findFilesRecursive(extractDir);
            const hasPreprocessedKtx2 = allExtractedFiles.some(f => f.name.toLowerCase().endsWith('.ktx2'));
            const hasPreprocessedCubemaps = allExtractedFiles.some(f => f.fullPath.includes('cubemaps') || f.name.toLowerCase().includes('_px.'));
            const preprocessedMetadata = allExtractedFiles.find(f => f.name.toLowerCase() === 'scan_metadata.json');
            if (hasPreprocessedKtx2 || (hasPreprocessedCubemaps && preprocessedMetadata)) {
                console.log(`[processPanoramas] Detected PRE-PROCESSED tour package (${allExtractedFiles.length} files)! Fast direct ingestion active.`);
                if (onProgress)
                    await onProgress(25, `Pre-processed tour package detected. Unpacking ${allExtractedFiles.length} assets...`);
                for (const f of allExtractedFiles) {
                    const rel = path.relative(extractDir, f.fullPath).replace(/\\/g, '/');
                    const dest = path.join(outputDir, rel);
                    fs.mkdirSync(path.dirname(dest), { recursive: true });
                    fs.copyFileSync(f.fullPath, dest);
                }
                if (onProgress)
                    await onProgress(70, 'Syncing optimized multi-resolution textures with storage...');
                await uploadRecursive(outputDir);
                const scansJsonS3 = `inspections/${id}/scans.json`;
                if (!inspection.scansJsonUrl) {
                    await this.prisma.inspection.update({
                        where: { id },
                        data: { scansJsonUrl: scansJsonS3 },
                    });
                }
                if (onProgress)
                    await onProgress(100, 'Tour Ready');
                await this.prisma.inspection.update({
                    where: { id },
                    data: {
                        processingStatus: 'COMPLETED',
                        processingStage: 'Tour Ready (Pre-processed)',
                        processingProgress: 100,
                    }
                });
                console.log(`[processPanoramas] Direct ingestion completed! Uploaded ${uploadedCount} pre-processed assets.`);
                return { status: 'SUCCESS', filesCount: uploadedCount, scansProcessed: 'preprocessed' };
            }
            let scansJsonPath = null;
            let rawScansData = null;
            for (const f of allExtractedFiles) {
                if (f.name.toLowerCase() === 'scans.json') {
                    scansJsonPath = f.fullPath;
                    try {
                        rawScansData = JSON.parse(fs.readFileSync(f.fullPath, 'utf8'));
                    }
                    catch (e) {
                        console.warn('[processPanoramas] Error parsing scans.json:', e);
                    }
                    break;
                }
            }
            if (!rawScansData) {
                try {
                    const rootScansPath = path.join(tempDir, 'root_scans.json');
                    await this.storageService.downloadFile(bucket, `inspections/${id}/scans.json`, rootScansPath);
                    if (fs.existsSync(rootScansPath)) {
                        rawScansData = JSON.parse(fs.readFileSync(rootScansPath, 'utf8'));
                        console.log(`[processPanoramas] Loaded root scans.json from inspection storage (${rawScansData.length || Object.keys(rawScansData).length} stations)`);
                    }
                }
                catch (e) {
                }
            }
            const scanCubemaps = new Map();
            const scanEquirects = new Map();
            const scanEquirectLows = new Map();
            const faceRegex = /^(?:scan_)?(\d+|[a-zA-Z0-9_-]+)_(px|nx|py|ny|pz|nz)\.(jpe?g|png)$/i;
            const equirectLowRegex = /^(?:scan_)?(\d+|[a-zA-Z0-9_-]+)_equirect_low\.(jpe?g|png)$/i;
            const equirectRegex = /^(?:scan_)?(\d+|[a-zA-Z0-9_-]+)_(?:equirect|pano)\.(jpe?g|png)$/i;
            for (const f of allExtractedFiles) {
                const eqLowMatch = f.name.match(equirectLowRegex);
                if (eqLowMatch) {
                    const scanId = eqLowMatch[1];
                    scanEquirectLows.set(scanId, f.fullPath);
                    continue;
                }
                const eqMatch = f.name.match(equirectRegex);
                if (eqMatch) {
                    const scanId = eqMatch[1];
                    scanEquirects.set(scanId, f.fullPath);
                    continue;
                }
                const faceMatch = f.name.match(faceRegex);
                if (faceMatch) {
                    const scanId = faceMatch[1];
                    const face = faceMatch[2].toLowerCase();
                    if (!scanCubemaps.has(scanId)) {
                        scanCubemaps.set(scanId, {});
                    }
                    scanCubemaps.get(scanId)[face] = f.fullPath;
                }
            }
            const scanIds = new Set([
                ...scanCubemaps.keys(),
                ...scanEquirects.keys(),
                ...scanEquirectLows.keys(),
            ]);
            if (rawScansData) {
                const arr = Array.isArray(rawScansData) ? rawScansData : Object.keys(rawScansData).map(k => ({ '#name': k }));
                arr.forEach((s, idx) => {
                    const name = s['#name'] || s.id || `scan_${idx}`;
                    const clean = String(name).replace(/^scan_/, '');
                    scanIds.add(clean);
                });
            }
            console.log(`[processPanoramas] Found ${scanIds.size} scan stations to process.`);
            let wasmtimeBin = 'wasmtime';
            if (process.platform === 'win32') {
                const localWin = path.resolve(process.cwd(), 'bin/wasmtime.exe');
                if (fs.existsSync(localWin))
                    wasmtimeBin = localWin;
            }
            else {
                if (fs.existsSync('/usr/local/bin/wasmtime'))
                    wasmtimeBin = '/usr/local/bin/wasmtime';
            }
            const wasmModule = path.resolve(process.cwd(), 'bin/basisu_st.wasm');
            const hasWasmEncoder = (fs.existsSync(wasmtimeBin) || wasmtimeBin === 'wasmtime') && fs.existsSync(wasmModule);
            const metadataOut = {};
            let scanIdx = 0;
            for (const scanId of scanIds) {
                scanIdx++;
                const cleanId = String(scanId).replace(/^scan_/, '');
                const fullScanKey = `scan_${cleanId}`;
                const scanPct = Math.min(88, 10 + Math.floor((scanIdx / Math.max(1, scanIds.size)) * 75));
                if (onProgress) {
                    await onProgress(scanPct, `Generating multi-LOD cubemaps & KTX2 for station ${scanIdx}/${scanIds.size} (${fullScanKey})...`);
                }
                console.log(`[processPanoramas] Processing ${fullScanKey}...`);
                const origEquirect = scanEquirects.get(cleanId) || scanEquirects.get(fullScanKey);
                const origEquirectLow = scanEquirectLows.get(cleanId) || scanEquirectLows.get(fullScanKey);
                const destEquirectLow = path.join(equirectLowDir, `${fullScanKey}_equirect_low.jpg`);
                const destEquirect = path.join(equirectDir, `${fullScanKey}_equirect.jpg`);
                if (origEquirect) {
                    fs.copyFileSync(origEquirect, destEquirect);
                    try {
                        await sharp(origEquirect)
                            .resize(2048, 1024, { fit: 'fill' })
                            .jpeg({ quality: 85, mozjpeg: true })
                            .toFile(destEquirectLow);
                        console.log(`  [MozJPEG] Generated crisp 2048x1024 ${destEquirectLow}`);
                    }
                    catch (e) {
                        console.warn(`  [processPanoramas] Error generating equirect_low for ${fullScanKey}:`, e.message);
                    }
                }
                else if (origEquirectLow) {
                    fs.copyFileSync(origEquirectLow, destEquirectLow);
                }
                const faces = scanCubemaps.get(cleanId) || scanCubemaps.get(fullScanKey);
                const requiredFaces = ['px', 'nx', 'py', 'ny', 'pz', 'nz'];
                const hasAllFaces = faces && requiredFaces.every(f => !!faces[f]);
                if (hasAllFaces) {
                    for (const f of requiredFaces) {
                        const destFace = path.join(cubemapsDir, `${fullScanKey}_${f}.jpg`);
                        fs.copyFileSync(faces[f], destFace);
                    }
                    if (hasWasmEncoder) {
                        const sizes = [256, 512, 1024];
                        for (const size of sizes) {
                            const ktx2RelOut = `output/ktx2/${fullScanKey}_${size}.ktx2`;
                            const faceRelPaths = requiredFaces.map(f => `output/cubemaps/${fullScanKey}_${f}.jpg`);
                            const cmd = `"${wasmtimeBin}" run --dir . "${wasmModule}" -cubemap -uastc -uastc_level 2 -mipmap -resample ${size} ${size} -output_file ${ktx2RelOut} ${faceRelPaths.join(' ')}`;
                            try {
                                await execPromise(cmd, { cwd: tempDir });
                                console.log(`  [KTX2] Generated ${fullScanKey}_${size}.ktx2`);
                            }
                            catch (ktxErr) {
                                console.warn(`  [KTX2] Failed generating ${fullScanKey}_${size}.ktx2:`, ktxErr.message);
                            }
                        }
                    }
                }
                let position = [0, 0, 0];
                let quaternion_xyzw = [0, 0, 0, 1];
                let quaternion_wxyz = [1, 0, 0, 0];
                if (rawScansData) {
                    let matchedScan = null;
                    if (Array.isArray(rawScansData)) {
                        matchedScan = rawScansData.find((s) => s['#name'] === fullScanKey || s['#name'] === cleanId || s.id === fullScanKey || s.id === cleanId);
                    }
                    else if (rawScansData[fullScanKey] || rawScansData[cleanId]) {
                        matchedScan = rawScansData[fullScanKey] || rawScansData[cleanId];
                    }
                    if (matchedScan) {
                        const posX = matchedScan.x ?? matchedScan.posX ?? matchedScan.position?.[0] ?? 0;
                        const posY = matchedScan.y ?? matchedScan.posY ?? matchedScan.position?.[1] ?? 0;
                        const posZ = matchedScan.alt ?? matchedScan.z ?? matchedScan.posZ ?? matchedScan.position?.[2] ?? 0;
                        position = [posX, posY, posZ];
                        if (matchedScan.quaternion_xyzw) {
                            quaternion_xyzw = matchedScan.quaternion_xyzw;
                            quaternion_wxyz = [matchedScan.quaternion_xyzw[3], matchedScan.quaternion_xyzw[0], matchedScan.quaternion_xyzw[1], matchedScan.quaternion_xyzw[2]];
                        }
                        else if (matchedScan.rotation_quaternion) {
                            const rq = matchedScan.rotation_quaternion;
                            quaternion_wxyz = rq;
                            quaternion_xyzw = [rq[1], rq[2], rq[3], rq[0]];
                        }
                    }
                }
                metadataOut[fullScanKey] = {
                    index: parseInt(cleanId, 10) || 0,
                    position,
                    quaternion_xyzw,
                    quaternion_wxyz,
                    cubemap_urls: [
                        `cubemaps/${fullScanKey}_px.jpg`,
                        `cubemaps/${fullScanKey}_nx.jpg`,
                        `cubemaps/${fullScanKey}_py.jpg`,
                        `cubemaps/${fullScanKey}_ny.jpg`,
                        `cubemaps/${fullScanKey}_pz.jpg`,
                        `cubemaps/${fullScanKey}_nz.jpg`,
                    ],
                    equirect_url: `equirect/${fullScanKey}_equirect.jpg`,
                    equirect_low_url: `equirect_low/${fullScanKey}_equirect_low.jpg`,
                    ktx2_256: fs.existsSync(path.join(outputDir, `output/ktx2/${fullScanKey}_256.ktx2`)) || fs.existsSync(path.join(ktx2Dir, `${fullScanKey}_256.ktx2`)) ? `ktx2/${fullScanKey}_256.ktx2` : null,
                    ktx2_512: fs.existsSync(path.join(outputDir, `output/ktx2/${fullScanKey}_512.ktx2`)) || fs.existsSync(path.join(ktx2Dir, `${fullScanKey}_512.ktx2`)) ? `ktx2/${fullScanKey}_512.ktx2` : null,
                    ktx2_1024: fs.existsSync(path.join(outputDir, `output/ktx2/${fullScanKey}_1024.ktx2`)) || fs.existsSync(path.join(ktx2Dir, `${fullScanKey}_1024.ktx2`)) ? `ktx2/${fullScanKey}_1024.ktx2` : null,
                };
            }
            fs.writeFileSync(path.join(outputDir, 'scan_metadata.json'), JSON.stringify(metadataOut, null, 2), 'utf8');
            if (scansJsonPath) {
                fs.copyFileSync(scansJsonPath, path.join(outputDir, 'scans.json'));
            }
            if (onProgress)
                await onProgress(90, 'Uploading multi-LOD textures and metadata to storage...');
            await uploadRecursive(outputDir);
            console.log(`[processPanoramas] Uploaded ${uploadedCount} optimized panorama assets (KTX2, LODs, equirects) to inspections/${id}/`);
            const scansJsonS3 = `inspections/${id}/scans.json`;
            if (!inspection.scansJsonUrl) {
                await this.prisma.inspection.update({
                    where: { id },
                    data: { scansJsonUrl: scansJsonS3 },
                });
            }
            return { status: 'SUCCESS', filesCount: uploadedCount, scansProcessed: scanIds.size };
        }
        catch (err) {
            console.error(`[processPanoramas] Error:`, err);
            throw new common_1.InternalServerErrorException(`Failed to process panoramas: ${err.message}`);
        }
        finally {
            fs.rmSync(tempDir, { recursive: true, force: true });
        }
    }
    async getProcessingStatus(id) {
        const inspection = await this.prisma.inspection.findUnique({
            where: { id },
            select: {
                id: true,
                processingStatus: true,
                processingProgress: true,
                processingStage: true,
                processingError: true,
                glbModelUrl: true,
                scansJsonUrl: true,
            },
        });
        if (!inspection)
            throw new common_1.NotFoundException('Inspection not found');
        return inspection;
    }
    async markAsQueued(id, stage = 'Queued in background asset processing worker...') {
        return this.prisma.inspection.update({
            where: { id },
            data: {
                processingStatus: 'QUEUED',
                processingProgress: 0,
                processingStage: stage,
                processingError: null,
            },
        });
    }
};
exports.InspectionsService = InspectionsService;
exports.InspectionsService = InspectionsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        storage_service_1.StorageService])
], InspectionsService);
//# sourceMappingURL=inspections.service.js.map