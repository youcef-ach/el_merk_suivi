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
exports.InspectionsDirectController = void 0;
const common_1 = require("@nestjs/common");
const inspections_service_1 = require("./inspections.service");
const jwt_auth_guard_1 = require("../auth/jwt-auth.guard");
const roles_guard_1 = require("../auth/roles.guard");
const public_decorator_1 = require("../../decorators/public.decorator");
const get_user_decorator_1 = require("../../decorators/get-user.decorator");
let InspectionsDirectController = class InspectionsDirectController {
    constructor(inspectionsService) {
        this.inspectionsService = inspectionsService;
    }
    findOne(id, user) {
        return this.inspectionsService.findOne(id, user);
    }
    getBundle(id, user) {
        return this.inspectionsService.getBundle(id, user);
    }
};
exports.InspectionsDirectController = InspectionsDirectController;
__decorate([
    (0, public_decorator_1.IsPublic)(),
    (0, common_1.Get)(':id'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, get_user_decorator_1.GetUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], InspectionsDirectController.prototype, "findOne", null);
__decorate([
    (0, public_decorator_1.IsPublic)(),
    (0, common_1.Get)(':id/bundle'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, get_user_decorator_1.GetUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], InspectionsDirectController.prototype, "getBundle", null);
exports.InspectionsDirectController = InspectionsDirectController = __decorate([
    (0, common_1.Controller)('inspections'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    __metadata("design:paramtypes", [inspections_service_1.InspectionsService])
], InspectionsDirectController);
//# sourceMappingURL=inspections-direct.controller.js.map