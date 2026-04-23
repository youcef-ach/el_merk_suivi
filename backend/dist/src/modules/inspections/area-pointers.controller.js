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
exports.AreaPointersController = void 0;
const common_1 = require("@nestjs/common");
const inspections_service_1 = require("./inspections.service");
const create_area_pointer_dto_1 = require("./dto/create-area-pointer.dto");
const update_area_pointer_dto_1 = require("./dto/update-area-pointer.dto");
const jwt_auth_guard_1 = require("../auth/jwt-auth.guard");
const roles_guard_1 = require("../auth/roles.guard");
const get_user_decorator_1 = require("../../decorators/get-user.decorator");
let AreaPointersController = class AreaPointersController {
    constructor(inspectionsService) {
        this.inspectionsService = inspectionsService;
    }
    create(inspectionId, dto, user) {
        return this.inspectionsService.createAreaPointer(inspectionId, dto, user.id, user.role);
    }
    update(inspectionId, pointerId, dto, user) {
        return this.inspectionsService.updateAreaPointer(inspectionId, pointerId, dto, user.id, user.role);
    }
    remove(inspectionId, pointerId, user) {
        return this.inspectionsService.deleteAreaPointer(inspectionId, pointerId, user.id, user.role);
    }
};
exports.AreaPointersController = AreaPointersController;
__decorate([
    (0, common_1.Post)(),
    __param(0, (0, common_1.Param)('inspectionId')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, get_user_decorator_1.GetUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, create_area_pointer_dto_1.CreateAreaPointerDto, Object]),
    __metadata("design:returntype", void 0)
], AreaPointersController.prototype, "create", null);
__decorate([
    (0, common_1.Patch)(':pointerId'),
    __param(0, (0, common_1.Param)('inspectionId')),
    __param(1, (0, common_1.Param)('pointerId')),
    __param(2, (0, common_1.Body)()),
    __param(3, (0, get_user_decorator_1.GetUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, update_area_pointer_dto_1.UpdateAreaPointerDto, Object]),
    __metadata("design:returntype", void 0)
], AreaPointersController.prototype, "update", null);
__decorate([
    (0, common_1.Delete)(':pointerId'),
    __param(0, (0, common_1.Param)('inspectionId')),
    __param(1, (0, common_1.Param)('pointerId')),
    __param(2, (0, get_user_decorator_1.GetUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object]),
    __metadata("design:returntype", void 0)
], AreaPointersController.prototype, "remove", null);
exports.AreaPointersController = AreaPointersController = __decorate([
    (0, common_1.Controller)('inspections/:inspectionId/area-pointers'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    __metadata("design:paramtypes", [inspections_service_1.InspectionsService])
], AreaPointersController);
//# sourceMappingURL=area-pointers.controller.js.map