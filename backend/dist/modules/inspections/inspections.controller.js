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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.InspectionsController = void 0;
const common_1 = require("@nestjs/common");
const inspections_service_1 = require("./inspections.service");
const create_inspection_dto_1 = require("./dto/create-inspection.dto");
const create_scan_dto_1 = require("./dto/create-scan.dto");
const create_panorama_dto_1 = require("./dto/create-panorama.dto");
const update_inspection_permissions_dto_1 = require("./dto/update-inspection-permissions.dto");
const process_scans_dto_1 = require("./dto/process-scans.dto");
const jwt_auth_guard_1 = require("../auth/jwt-auth.guard");
const roles_guard_1 = require("../auth/roles.guard");
const public_decorator_1 = require("../../decorators/public.decorator");
const get_user_decorator_1 = require("../../decorators/get-user.decorator");
const roles_decorator_1 = require("../../decorators/roles.decorator");
const client_1 = require("@prisma/client");
const bullmq_1 = require("@nestjs/bullmq");
const bullmq_2 = require("bullmq");
const queue_constants_1 = require("../queues/queue.constants");
let InspectionsController = class InspectionsController {
    constructor(inspectionsService, assetQueue) {
        this.inspectionsService = inspectionsService;
        this.assetQueue = assetQueue;
    }
    create(projectId, createInspectionDto, user) {
        return this.inspectionsService.create(projectId, createInspectionDto, user.id);
    }
    findAll(projectId, user) {
        return this.inspectionsService.findAll(projectId, user);
    }
    findOne(id, user) {
        return this.inspectionsService.findOne(id, user);
    }
    getBundle(id, user) {
        return this.inspectionsService.getBundle(id, user);
    }
    clone(id, user) {
        return this.inspectionsService.clone(id, user.enterpriseId, user.role);
    }
    createScan(id, dto, user) {
        return this.inspectionsService.createScan(id, dto, user.enterpriseId, user.role);
    }
    createPanorama(id, dto, user) {
        return this.inspectionsService.createPanorama(id, dto, user.enterpriseId, user.role);
    }
    setPermissions(id, dto, user) {
        return this.inspectionsService.setPermissions(id, dto, user.enterpriseId, user.role);
    }
    updateInspection(id, dto, user) {
        return this.inspectionsService.update(id, dto, user.enterpriseId, user.role);
    }
    remove(id, user) {
        return this.inspectionsService.remove(id, user.enterpriseId, user.role);
    }
    getUploadUrl(id, fileName, user) {
        return this.inspectionsService.getUploadUrl(id, fileName, user.enterpriseId, user.role);
    }
    async processAndUploadScans(id, body, user) {
        return this.inspectionsService.processAndUploadScans(id, body.mpData, body.rcData, user.enterpriseId, user.role);
    }
    async processGlb(id, fileName, compressionMode, user) {
        await this.inspectionsService.markAsQueued(id, 'Queued 3D model processing in background worker...');
        const job = await this.assetQueue.add(queue_constants_1.JOB_PROCESS_GLB, {
            inspectionId: id,
            userEnterpriseId: user.enterpriseId,
            role: user.role,
            fileName,
            compressionMode,
        });
        return {
            status: 'QUEUED',
            jobId: job.id,
            message: '3D model processing queued in background',
        };
    }
    async processTileset(id, user) {
        await this.inspectionsService.markAsQueued(id, 'Queued 3D tileset processing in background worker...');
        const job = await this.assetQueue.add(queue_constants_1.JOB_PROCESS_TILESET, {
            inspectionId: id,
            userEnterpriseId: user.enterpriseId,
            role: user.role,
        });
        return {
            status: 'QUEUED',
            jobId: job.id,
            message: 'Tileset processing queued in background',
        };
    }
    async processPanoramas(id, user) {
        await this.inspectionsService.markAsQueued(id, 'Queued panorama multi-LOD processing in background worker...');
        const job = await this.assetQueue.add(queue_constants_1.JOB_PROCESS_PANORAMAS, {
            inspectionId: id,
            userEnterpriseId: user.enterpriseId,
            role: user.role,
        });
        return {
            status: 'QUEUED',
            jobId: job.id,
            message: 'Panorama multi-LOD processing queued in background',
        };
    }
    async getProcessingStatus(id) {
        return this.inspectionsService.getProcessingStatus(id);
    }
};
exports.InspectionsController = InspectionsController;
__decorate([
    (0, common_1.Post)(),
    __param(0, (0, common_1.Param)('projectId')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, get_user_decorator_1.GetUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, create_inspection_dto_1.CreateInspectionDto, Object]),
    __metadata("design:returntype", void 0)
], InspectionsController.prototype, "create", null);
__decorate([
    (0, public_decorator_1.IsPublic)(),
    (0, common_1.Get)(),
    __param(0, (0, common_1.Param)('projectId')),
    __param(1, (0, get_user_decorator_1.GetUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], InspectionsController.prototype, "findAll", null);
__decorate([
    (0, public_decorator_1.IsPublic)(),
    (0, common_1.Get)(':id'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, get_user_decorator_1.GetUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], InspectionsController.prototype, "findOne", null);
__decorate([
    (0, public_decorator_1.IsPublic)(),
    (0, common_1.Get)(':id/bundle'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, get_user_decorator_1.GetUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], InspectionsController.prototype, "getBundle", null);
__decorate([
    (0, common_1.Post)(':id/clone'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, get_user_decorator_1.GetUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], InspectionsController.prototype, "clone", null);
__decorate([
    (0, common_1.Post)(':id/scans'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, get_user_decorator_1.GetUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, create_scan_dto_1.CreateScanDto, Object]),
    __metadata("design:returntype", void 0)
], InspectionsController.prototype, "createScan", null);
__decorate([
    (0, common_1.Post)(':id/panoramas'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, get_user_decorator_1.GetUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, create_panorama_dto_1.CreatePanoramaDto, Object]),
    __metadata("design:returntype", void 0)
], InspectionsController.prototype, "createPanorama", null);
__decorate([
    (0, common_1.Patch)(':id/permissions'),
    (0, roles_decorator_1.Roles)(client_1.Role.ADMIN),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, get_user_decorator_1.GetUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, update_inspection_permissions_dto_1.UpdateInspectionPermissionsDto, Object]),
    __metadata("design:returntype", void 0)
], InspectionsController.prototype, "setPermissions", null);
__decorate([
    (0, common_1.Patch)(':id'),
    (0, roles_decorator_1.Roles)(client_1.Role.ADMIN),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, get_user_decorator_1.GetUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", void 0)
], InspectionsController.prototype, "updateInspection", null);
__decorate([
    (0, common_1.Delete)(':id'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, get_user_decorator_1.GetUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], InspectionsController.prototype, "remove", null);
__decorate([
    (0, common_1.Post)(':id/upload-url'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)('fileName')),
    __param(2, (0, get_user_decorator_1.GetUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object]),
    __metadata("design:returntype", void 0)
], InspectionsController.prototype, "getUploadUrl", null);
__decorate([
    (0, common_1.Post)(':id/process-scans'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, get_user_decorator_1.GetUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, process_scans_dto_1.ProcessScansDto, Object]),
    __metadata("design:returntype", Promise)
], InspectionsController.prototype, "processAndUploadScans", null);
__decorate([
    (0, common_1.Post)(':id/process-glb'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)('fileName')),
    __param(2, (0, common_1.Body)('compressionMode')),
    __param(3, (0, get_user_decorator_1.GetUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String, Object]),
    __metadata("design:returntype", Promise)
], InspectionsController.prototype, "processGlb", null);
__decorate([
    (0, common_1.Post)(':id/process-tileset'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, get_user_decorator_1.GetUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], InspectionsController.prototype, "processTileset", null);
__decorate([
    (0, common_1.Post)(':id/process-panoramas'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, get_user_decorator_1.GetUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], InspectionsController.prototype, "processPanoramas", null);
__decorate([
    (0, public_decorator_1.IsPublic)(),
    (0, common_1.Get)(':id/processing-status'),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], InspectionsController.prototype, "getProcessingStatus", null);
exports.InspectionsController = InspectionsController = __decorate([
    (0, common_1.Controller)('projects/:projectId/inspections'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    __param(1, (0, bullmq_1.InjectQueue)(queue_constants_1.ASSET_PROCESSING_QUEUE)),
    __metadata("design:paramtypes", [inspections_service_1.InspectionsService,
        bullmq_2.Queue])
], InspectionsController);
//# sourceMappingURL=inspections.controller.js.map