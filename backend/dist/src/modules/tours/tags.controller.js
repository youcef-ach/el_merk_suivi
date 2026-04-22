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
exports.TagsController = void 0;
const common_1 = require("@nestjs/common");
const tours_service_1 = require("./tours.service");
const create_tag_dto_1 = require("./dto/create-tag.dto");
const update_tag_dto_1 = require("./dto/update-tag.dto");
const create_tag_document_dto_1 = require("./dto/create-tag-document.dto");
const jwt_auth_guard_1 = require("../auth/jwt-auth.guard");
const roles_guard_1 = require("../auth/roles.guard");
const get_user_decorator_1 = require("../../decorators/get-user.decorator");
let TagsController = class TagsController {
    constructor(toursService) {
        this.toursService = toursService;
    }
    create(tourId, dto, user) {
        return this.toursService.createTag(tourId, dto, user.id, user.role);
    }
    update(tourId, tagId, dto, user) {
        return this.toursService.updateTag(tourId, tagId, dto, user.id, user.role);
    }
    remove(tourId, tagId, user) {
        return this.toursService.deleteTag(tourId, tagId, user.id, user.role);
    }
    addDocument(tourId, tagId, dto, user) {
        return this.toursService.addTagDocument(tourId, tagId, dto, user.id, user.role);
    }
    removeDocument(tourId, tagId, docId, user) {
        return this.toursService.deleteTagDocument(tourId, tagId, docId, user.id, user.role);
    }
};
exports.TagsController = TagsController;
__decorate([
    (0, common_1.Post)(),
    __param(0, (0, common_1.Param)('tourId')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, get_user_decorator_1.GetUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, create_tag_dto_1.CreateTagDto, Object]),
    __metadata("design:returntype", void 0)
], TagsController.prototype, "create", null);
__decorate([
    (0, common_1.Patch)(':tagId'),
    __param(0, (0, common_1.Param)('tourId')),
    __param(1, (0, common_1.Param)('tagId')),
    __param(2, (0, common_1.Body)()),
    __param(3, (0, get_user_decorator_1.GetUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, update_tag_dto_1.UpdateTagDto, Object]),
    __metadata("design:returntype", void 0)
], TagsController.prototype, "update", null);
__decorate([
    (0, common_1.Delete)(':tagId'),
    __param(0, (0, common_1.Param)('tourId')),
    __param(1, (0, common_1.Param)('tagId')),
    __param(2, (0, get_user_decorator_1.GetUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object]),
    __metadata("design:returntype", void 0)
], TagsController.prototype, "remove", null);
__decorate([
    (0, common_1.Post)(':tagId/documents'),
    __param(0, (0, common_1.Param)('tourId')),
    __param(1, (0, common_1.Param)('tagId')),
    __param(2, (0, common_1.Body)()),
    __param(3, (0, get_user_decorator_1.GetUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, create_tag_document_dto_1.CreateTagDocumentDto, Object]),
    __metadata("design:returntype", void 0)
], TagsController.prototype, "addDocument", null);
__decorate([
    (0, common_1.Delete)(':tagId/documents/:docId'),
    __param(0, (0, common_1.Param)('tourId')),
    __param(1, (0, common_1.Param)('tagId')),
    __param(2, (0, common_1.Param)('docId')),
    __param(3, (0, get_user_decorator_1.GetUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String, Object]),
    __metadata("design:returntype", void 0)
], TagsController.prototype, "removeDocument", null);
exports.TagsController = TagsController = __decorate([
    (0, common_1.Controller)('tours/:tourId/tags'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    __metadata("design:paramtypes", [tours_service_1.ToursService])
], TagsController);
//# sourceMappingURL=tags.controller.js.map