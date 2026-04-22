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
exports.ToursController = void 0;
const common_1 = require("@nestjs/common");
const tours_service_1 = require("./tours.service");
const create_tour_dto_1 = require("./dto/create-tour.dto");
const create_scan_dto_1 = require("./dto/create-scan.dto");
const create_panorama_dto_1 = require("./dto/create-panorama.dto");
const update_tour_permissions_dto_1 = require("./dto/update-tour-permissions.dto");
const jwt_auth_guard_1 = require("../auth/jwt-auth.guard");
const roles_guard_1 = require("../auth/roles.guard");
const public_decorator_1 = require("../../decorators/public.decorator");
const get_user_decorator_1 = require("../../decorators/get-user.decorator");
const roles_decorator_1 = require("../../decorators/roles.decorator");
const client_1 = require("@prisma/client");
let ToursController = class ToursController {
    constructor(toursService) {
        this.toursService = toursService;
    }
    create(createTourDto, user) {
        return this.toursService.create(createTourDto, user.id);
    }
    findAll(user) {
        return this.toursService.findAll(user);
    }
    findOne(id, user) {
        return this.toursService.findOne(id, user);
    }
    getBundle(id, user) {
        return this.toursService.getBundle(id, user);
    }
    createScan(id, dto, user) {
        return this.toursService.createScan(id, dto, user.id, user.role);
    }
    createPanorama(id, dto, user) {
        return this.toursService.createPanorama(id, dto, user.id, user.role);
    }
    setPermissions(id, dto, user) {
        return this.toursService.setPermissions(id, dto, user.id, user.role);
    }
    remove(id, user) {
        return this.toursService.remove(id, user.id, user.role);
    }
    getUploadUrl(id, fileName, user) {
        return this.toursService.getUploadUrl(id, fileName, user.id, user.role);
    }
};
exports.ToursController = ToursController;
__decorate([
    (0, common_1.Post)(),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, get_user_decorator_1.GetUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [create_tour_dto_1.CreateTourDto, Object]),
    __metadata("design:returntype", void 0)
], ToursController.prototype, "create", null);
__decorate([
    (0, public_decorator_1.IsPublic)(),
    (0, common_1.Get)(),
    __param(0, (0, get_user_decorator_1.GetUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], ToursController.prototype, "findAll", null);
__decorate([
    (0, public_decorator_1.IsPublic)(),
    (0, common_1.Get)(':id'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, get_user_decorator_1.GetUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], ToursController.prototype, "findOne", null);
__decorate([
    (0, public_decorator_1.IsPublic)(),
    (0, common_1.Get)(':id/bundle'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, get_user_decorator_1.GetUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], ToursController.prototype, "getBundle", null);
__decorate([
    (0, common_1.Post)(':id/scans'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, get_user_decorator_1.GetUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, create_scan_dto_1.CreateScanDto, Object]),
    __metadata("design:returntype", void 0)
], ToursController.prototype, "createScan", null);
__decorate([
    (0, common_1.Post)(':id/panoramas'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, get_user_decorator_1.GetUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, create_panorama_dto_1.CreatePanoramaDto, Object]),
    __metadata("design:returntype", void 0)
], ToursController.prototype, "createPanorama", null);
__decorate([
    (0, common_1.Patch)(':id/permissions'),
    (0, roles_decorator_1.Roles)(client_1.Role.ADMIN),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, get_user_decorator_1.GetUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, update_tour_permissions_dto_1.UpdateTourPermissionsDto, Object]),
    __metadata("design:returntype", void 0)
], ToursController.prototype, "setPermissions", null);
__decorate([
    (0, common_1.Delete)(':id'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, get_user_decorator_1.GetUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], ToursController.prototype, "remove", null);
__decorate([
    (0, common_1.Post)(':id/upload-url'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)('fileName')),
    __param(2, (0, get_user_decorator_1.GetUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object]),
    __metadata("design:returntype", void 0)
], ToursController.prototype, "getUploadUrl", null);
exports.ToursController = ToursController = __decorate([
    (0, common_1.Controller)('tours'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    __metadata("design:paramtypes", [tours_service_1.ToursService])
], ToursController);
//# sourceMappingURL=tours.controller.js.map