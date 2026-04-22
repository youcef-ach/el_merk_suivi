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
exports.ToursService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
const storage_service_1 = require("../storage/storage.service");
const client_1 = require("@prisma/client");
let ToursService = class ToursService {
    constructor(prisma, storageService) {
        this.prisma = prisma;
        this.storageService = storageService;
    }
    async create(createTourDto, creatorId) {
        return this.prisma.tour.create({
            data: {
                ...createTourDto,
                creatorId,
            },
        });
    }
    async findAll(user) {
        if (!user) {
            return this.prisma.tour.findMany({
                where: { visibility: client_1.Visibility.PUBLIC },
            });
        }
        if (user.role === client_1.Role.ADMIN) {
            return this.prisma.tour.findMany();
        }
        return this.prisma.tour.findMany({
            where: {
                OR: [
                    { visibility: client_1.Visibility.PUBLIC },
                    { creatorId: user.id },
                    { authorizedViewers: { some: { id: user.id } } },
                ],
            },
        });
    }
    async findOne(id, user) {
        const tour = await this.prisma.tour.findUnique({
            where: { id },
            include: {
                scans: true,
                tags: { include: { documents: true } },
                panoramas: true,
                areaPointers: true,
                authorizedViewers: true,
            },
        });
        if (!tour) {
            throw new common_1.NotFoundException('Tour not found');
        }
        if (tour.visibility === client_1.Visibility.PUBLIC) {
            return tour;
        }
        if (!user) {
            throw new common_1.ForbiddenException('You must be logged in to access this private tour');
        }
        if (user.role === client_1.Role.ADMIN || tour.creatorId === user.id) {
            return tour;
        }
        const isAuthorized = tour.authorizedViewers.some((v) => v.id === user.id);
        if (!isAuthorized) {
            throw new common_1.ForbiddenException('You are not authorized to view this private tour');
        }
        return tour;
    }
    async getBundle(id, user) {
        const tour = await this.findOne(id, user);
        return tour;
    }
    async createScan(tourId, dto, userId, role) {
        const tour = await this.prisma.tour.findUnique({ where: { id: tourId } });
        if (!tour)
            throw new common_1.NotFoundException('Tour not found');
        if (tour.creatorId !== userId && role !== client_1.Role.ADMIN) {
            throw new common_1.ForbiddenException('Only the creator or admin can add a scan');
        }
        if (dto.targetScanId) {
            const targetScan = await this.prisma.scan.findUnique({ where: { id: dto.targetScanId } });
            if (!targetScan)
                throw new common_1.NotFoundException('Target scan not found');
            if (targetScan.tourId !== tourId) {
                throw new common_1.ForbiddenException('Target scan must belong to the same tour');
            }
        }
        return this.prisma.scan.create({
            data: {
                ...dto,
                tourId,
            },
        });
    }
    async createPanorama(tourId, dto, userId, role) {
        const tour = await this.prisma.tour.findUnique({ where: { id: tourId } });
        if (!tour)
            throw new common_1.NotFoundException('Tour not found');
        if (tour.creatorId !== userId && role !== client_1.Role.ADMIN) {
            throw new common_1.ForbiddenException('Only the creator or admin can add a panorama');
        }
        return this.prisma.panorama.create({
            data: {
                ...dto,
                status: client_1.ProcessingStatus.PENDING,
                tourId,
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
    async setPermissions(id, dto, userId, role) {
        const tour = await this.prisma.tour.findUnique({ where: { id } });
        if (!tour)
            throw new common_1.NotFoundException('Tour not found');
        if (tour.creatorId !== userId && role !== client_1.Role.ADMIN) {
            throw new common_1.ForbiddenException('Only the creator or admin can update permissions');
        }
        return this.prisma.tour.update({
            where: { id },
            data: {
                authorizedViewers: {
                    set: dto.authorizedViewerIds.map((vId) => ({ id: vId })),
                },
            },
            include: { authorizedViewers: true }
        });
    }
    async remove(id, userId, role) {
        const tour = await this.prisma.tour.findUnique({ where: { id } });
        if (!tour)
            throw new common_1.NotFoundException('Tour not found');
        if (tour.creatorId !== userId && role !== client_1.Role.ADMIN) {
            throw new common_1.ForbiddenException('Only the creator or admin can delete this tour');
        }
        return this.prisma.tour.delete({ where: { id } });
    }
    async getUploadUrl(id, fileName, userId, role) {
        const tour = await this.prisma.tour.findUnique({ where: { id } });
        if (!tour)
            throw new common_1.NotFoundException('Tour not found');
        if (tour.creatorId !== userId && role !== client_1.Role.ADMIN) {
            throw new common_1.ForbiddenException('Only the creator or admin can upload files to this tour');
        }
        const bucket = 'virtual-tours';
        const s3Path = `tours/${id}/${fileName}`;
        const presignedUrl = await this.storageService.getPresignedPutUrl(bucket, s3Path);
        if (fileName.endsWith('.glb')) {
            await this.prisma.tour.update({
                where: { id },
                data: { glbModelUrl: s3Path },
            });
        }
        else if (fileName.endsWith('scans.json')) {
            await this.prisma.tour.update({
                where: { id },
                data: { scansJsonUrl: s3Path },
            });
        }
        return { presignedUrl, expectedPath: s3Path };
    }
    async createTag(tourId, dto, userId, role) {
        const tour = await this.prisma.tour.findUnique({ where: { id: tourId } });
        if (!tour)
            throw new common_1.NotFoundException('Tour not found');
        if (tour.creatorId !== userId && role !== client_1.Role.ADMIN) {
            throw new common_1.ForbiddenException('Only the creator or admin can add tags');
        }
        return this.prisma.tag.create({
            data: {
                title: dto.title,
                description: dto.description,
                posX: dto.posX,
                posY: dto.posY,
                posZ: dto.posZ,
                tourId,
            },
            include: { documents: true },
        });
    }
    async updateTag(tourId, tagId, dto, userId, role) {
        const tour = await this.prisma.tour.findUnique({ where: { id: tourId } });
        if (!tour)
            throw new common_1.NotFoundException('Tour not found');
        if (tour.creatorId !== userId && role !== client_1.Role.ADMIN) {
            throw new common_1.ForbiddenException('Only the creator or admin can edit tags');
        }
        const tag = await this.prisma.tag.findUnique({ where: { id: tagId } });
        if (!tag || tag.tourId !== tourId)
            throw new common_1.NotFoundException('Tag not found in this tour');
        return this.prisma.tag.update({
            where: { id: tagId },
            data: dto,
            include: { documents: true },
        });
    }
    async deleteTag(tourId, tagId, userId, role) {
        const tour = await this.prisma.tour.findUnique({ where: { id: tourId } });
        if (!tour)
            throw new common_1.NotFoundException('Tour not found');
        if (tour.creatorId !== userId && role !== client_1.Role.ADMIN) {
            throw new common_1.ForbiddenException('Only the creator or admin can delete tags');
        }
        const tag = await this.prisma.tag.findUnique({ where: { id: tagId } });
        if (!tag || tag.tourId !== tourId)
            throw new common_1.NotFoundException('Tag not found in this tour');
        return this.prisma.tag.delete({ where: { id: tagId } });
    }
    async addTagDocument(tourId, tagId, dto, userId, role) {
        const tour = await this.prisma.tour.findUnique({ where: { id: tourId } });
        if (!tour)
            throw new common_1.NotFoundException('Tour not found');
        if (tour.creatorId !== userId && role !== client_1.Role.ADMIN) {
            throw new common_1.ForbiddenException('Only the creator or admin can upload tag documents');
        }
        const tag = await this.prisma.tag.findUnique({ where: { id: tagId } });
        if (!tag || tag.tourId !== tourId)
            throw new common_1.NotFoundException('Tag not found in this tour');
        const bucket = 'virtual-tours';
        const s3Path = `tours/${tourId}/tags/${tagId}/${dto.fileName}`;
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
    async deleteTagDocument(tourId, tagId, docId, userId, role) {
        const tour = await this.prisma.tour.findUnique({ where: { id: tourId } });
        if (!tour)
            throw new common_1.NotFoundException('Tour not found');
        if (tour.creatorId !== userId && role !== client_1.Role.ADMIN) {
            throw new common_1.ForbiddenException('Only the creator or admin can delete tag documents');
        }
        const doc = await this.prisma.tagDocument.findUnique({ where: { id: docId } });
        if (!doc || doc.tagId !== tagId)
            throw new common_1.NotFoundException('Document not found on this tag');
        return this.prisma.tagDocument.delete({ where: { id: docId } });
    }
    async createAreaPointer(tourId, dto, userId, role) {
        const tour = await this.prisma.tour.findUnique({ where: { id: tourId } });
        if (!tour)
            throw new common_1.NotFoundException('Tour not found');
        if (tour.creatorId !== userId && role !== client_1.Role.ADMIN) {
            throw new common_1.ForbiddenException('Only the creator or admin can add area pointers');
        }
        return this.prisma.areaPointer.create({
            data: {
                name: dto.name,
                color: dto.color,
                posX: dto.posX,
                posY: dto.posY,
                posZ: dto.posZ,
                tourId,
            },
        });
    }
    async updateAreaPointer(tourId, pointerId, dto, userId, role) {
        const tour = await this.prisma.tour.findUnique({ where: { id: tourId } });
        if (!tour)
            throw new common_1.NotFoundException('Tour not found');
        if (tour.creatorId !== userId && role !== client_1.Role.ADMIN) {
            throw new common_1.ForbiddenException('Only the creator or admin can edit area pointers');
        }
        const pointer = await this.prisma.areaPointer.findUnique({ where: { id: pointerId } });
        if (!pointer || pointer.tourId !== tourId)
            throw new common_1.NotFoundException('Area pointer not found in this tour');
        return this.prisma.areaPointer.update({
            where: { id: pointerId },
            data: dto,
        });
    }
    async deleteAreaPointer(tourId, pointerId, userId, role) {
        const tour = await this.prisma.tour.findUnique({ where: { id: tourId } });
        if (!tour)
            throw new common_1.NotFoundException('Tour not found');
        if (tour.creatorId !== userId && role !== client_1.Role.ADMIN) {
            throw new common_1.ForbiddenException('Only the creator or admin can delete area pointers');
        }
        const pointer = await this.prisma.areaPointer.findUnique({ where: { id: pointerId } });
        if (!pointer || pointer.tourId !== tourId)
            throw new common_1.NotFoundException('Area pointer not found in this tour');
        return this.prisma.areaPointer.delete({ where: { id: pointerId } });
    }
};
exports.ToursService = ToursService;
exports.ToursService = ToursService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        storage_service_1.StorageService])
], ToursService);
//# sourceMappingURL=tours.service.js.map