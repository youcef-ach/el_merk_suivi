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
exports.EnterprisesController = void 0;
const common_1 = require("@nestjs/common");
const enterprises_service_1 = require("./enterprises.service");
const create_enterprise_dto_1 = require("./dto/create-enterprise.dto");
const add_member_dto_1 = require("./dto/add-member.dto");
const jwt_auth_guard_1 = require("../auth/jwt-auth.guard");
const roles_guard_1 = require("../auth/roles.guard");
const get_user_decorator_1 = require("../../decorators/get-user.decorator");
const roles_decorator_1 = require("../../decorators/roles.decorator");
const client_1 = require("@prisma/client");
let EnterprisesController = class EnterprisesController {
    constructor(enterprisesService) {
        this.enterprisesService = enterprisesService;
    }
    create(createEnterpriseDto) {
        return this.enterprisesService.create(createEnterpriseDto);
    }
    findAll() {
        return this.enterprisesService.findAll();
    }
    findOne(id) {
        return this.enterprisesService.findOne(id);
    }
    getMembers(user) {
        return this.enterprisesService.getMembers(user.enterpriseId);
    }
    addMember(dto, user) {
        return this.enterprisesService.addMember(dto, user.enterpriseId);
    }
    removeMember(memberId, user) {
        return this.enterprisesService.removeMember(memberId, user.enterpriseId, user.id);
    }
};
exports.EnterprisesController = EnterprisesController;
__decorate([
    (0, common_1.Post)(),
    (0, roles_decorator_1.Roles)(client_1.Role.ADMIN),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [create_enterprise_dto_1.CreateEnterpriseDto]),
    __metadata("design:returntype", void 0)
], EnterprisesController.prototype, "create", null);
__decorate([
    (0, common_1.Get)(),
    (0, roles_decorator_1.Roles)(client_1.Role.ADMIN),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], EnterprisesController.prototype, "findAll", null);
__decorate([
    (0, common_1.Get)(':id'),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], EnterprisesController.prototype, "findOne", null);
__decorate([
    (0, common_1.Get)('members/list'),
    (0, roles_decorator_1.Roles)(client_1.Role.ADMIN),
    __param(0, (0, get_user_decorator_1.GetUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], EnterprisesController.prototype, "getMembers", null);
__decorate([
    (0, common_1.Post)('members/add'),
    (0, roles_decorator_1.Roles)(client_1.Role.ADMIN),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, get_user_decorator_1.GetUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [add_member_dto_1.AddMemberDto, Object]),
    __metadata("design:returntype", void 0)
], EnterprisesController.prototype, "addMember", null);
__decorate([
    (0, common_1.Delete)('members/:memberId'),
    (0, roles_decorator_1.Roles)(client_1.Role.ADMIN),
    __param(0, (0, common_1.Param)('memberId')),
    __param(1, (0, get_user_decorator_1.GetUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], EnterprisesController.prototype, "removeMember", null);
exports.EnterprisesController = EnterprisesController = __decorate([
    (0, common_1.Controller)('enterprises'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    __metadata("design:paramtypes", [enterprises_service_1.EnterprisesService])
], EnterprisesController);
//# sourceMappingURL=enterprises.controller.js.map