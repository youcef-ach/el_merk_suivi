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
exports.StagingController = void 0;
const common_1 = require("@nestjs/common");
const inspections_service_1 = require("./inspections.service");
const jwt_auth_guard_1 = require("../auth/jwt-auth.guard");
let StagingController = class StagingController {
    constructor(inspectionsService) {
        this.inspectionsService = inspectionsService;
    }
    createProfile(inspectionId, body, req) {
        const { enterpriseId, role } = req.user;
        return this.inspectionsService.createStagingProfile(inspectionId, body.name, enterpriseId, role);
    }
    getProfile(inspectionId, profileId) {
        return this.inspectionsService.getStagingProfile(inspectionId, profileId);
    }
    saveItems(inspectionId, profileId, body, req) {
        const { enterpriseId, role } = req.user;
        return this.inspectionsService.saveStagedItems(inspectionId, profileId, body.items || [], enterpriseId, role);
    }
    saveBakedPanoramas(inspectionId, profileId, body, req) {
        const { enterpriseId, role } = req.user;
        return this.inspectionsService.saveBakedPanoramas(inspectionId, profileId, body.panoramas || [], enterpriseId, role);
    }
    getUploadUrl(id, fileName, req) {
        const { enterpriseId, role } = req.user;
        return this.inspectionsService.getUploadUrl(id, fileName, enterpriseId, role);
    }
};
exports.StagingController = StagingController;
__decorate([
    (0, common_1.Post)(':id/staging-profiles'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Request)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", void 0)
], StagingController.prototype, "createProfile", null);
__decorate([
    (0, common_1.Get)(':id/staging-profiles/:profileId'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Param)('profileId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", void 0)
], StagingController.prototype, "getProfile", null);
__decorate([
    (0, common_1.Post)(':id/staging-profiles/:profileId/items'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Param)('profileId')),
    __param(2, (0, common_1.Body)()),
    __param(3, (0, common_1.Request)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object, Object]),
    __metadata("design:returntype", void 0)
], StagingController.prototype, "saveItems", null);
__decorate([
    (0, common_1.Post)(':id/staging-profiles/:profileId/baked-panoramas'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Param)('profileId')),
    __param(2, (0, common_1.Body)()),
    __param(3, (0, common_1.Request)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object, Object]),
    __metadata("design:returntype", void 0)
], StagingController.prototype, "saveBakedPanoramas", null);
__decorate([
    (0, common_1.Post)(':id/upload-url'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)('fileName')),
    __param(2, (0, common_1.Request)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object]),
    __metadata("design:returntype", void 0)
], StagingController.prototype, "getUploadUrl", null);
exports.StagingController = StagingController = __decorate([
    (0, common_1.Controller)('inspections'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __metadata("design:paramtypes", [inspections_service_1.InspectionsService])
], StagingController);
//# sourceMappingURL=staging.controller.js.map