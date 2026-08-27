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
exports.SurveyDataController = void 0;
const common_1 = require("@nestjs/common");
const inspections_service_1 = require("./inspections.service");
const survey_meta_dto_1 = require("./dto/survey-meta.dto");
const create_survey_report_dto_1 = require("./dto/create-survey-report.dto");
const create_cross_section_dto_1 = require("./dto/create-cross-section.dto");
const create_site_measurement_dto_1 = require("./dto/create-site-measurement.dto");
const jwt_auth_guard_1 = require("../auth/jwt-auth.guard");
const roles_guard_1 = require("../auth/roles.guard");
const get_user_decorator_1 = require("../../decorators/get-user.decorator");
let SurveyDataController = class SurveyDataController {
    constructor(inspectionsService) {
        this.inspectionsService = inspectionsService;
    }
    updateMeta(inspectionId, dto, user) {
        return this.inspectionsService.updateSurveyMeta(inspectionId, dto, user.id, user.role);
    }
    addReport(inspectionId, dto, user) {
        return this.inspectionsService.createSurveyReport(inspectionId, dto, user.id, user.role);
    }
    getReports(inspectionId, user) {
        return this.inspectionsService.getSurveyReports(inspectionId, user.id, user.role);
    }
    deleteReport(inspectionId, reportId, user) {
        return this.inspectionsService.deleteSurveyReport(inspectionId, reportId, user.id, user.role);
    }
    addCrossSection(inspectionId, dto, user) {
        return this.inspectionsService.createCrossSection(inspectionId, dto, user.id, user.role);
    }
    getCrossSections(inspectionId, user) {
        return this.inspectionsService.getCrossSections(inspectionId, user.id, user.role);
    }
    deleteCrossSection(inspectionId, sectionId, user) {
        return this.inspectionsService.deleteCrossSection(inspectionId, sectionId, user.id, user.role);
    }
    addMeasurement(inspectionId, dto, user) {
        return this.inspectionsService.createSiteMeasurement(inspectionId, dto, user.id, user.role);
    }
    getMeasurements(inspectionId, user) {
        return this.inspectionsService.getSiteMeasurements(inspectionId, user.id, user.role);
    }
    deleteMeasurement(inspectionId, measurementId, user) {
        return this.inspectionsService.deleteSiteMeasurement(inspectionId, measurementId, user.id, user.role);
    }
};
exports.SurveyDataController = SurveyDataController;
__decorate([
    (0, common_1.Post)('meta'),
    __param(0, (0, common_1.Param)('inspectionId')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, get_user_decorator_1.GetUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, survey_meta_dto_1.UpdateSurveyMetaDto, Object]),
    __metadata("design:returntype", void 0)
], SurveyDataController.prototype, "updateMeta", null);
__decorate([
    (0, common_1.Post)('reports'),
    __param(0, (0, common_1.Param)('inspectionId')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, get_user_decorator_1.GetUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, create_survey_report_dto_1.CreateSurveyReportDto, Object]),
    __metadata("design:returntype", void 0)
], SurveyDataController.prototype, "addReport", null);
__decorate([
    (0, common_1.Get)('reports'),
    __param(0, (0, common_1.Param)('inspectionId')),
    __param(1, (0, get_user_decorator_1.GetUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], SurveyDataController.prototype, "getReports", null);
__decorate([
    (0, common_1.Delete)('reports/:reportId'),
    __param(0, (0, common_1.Param)('inspectionId')),
    __param(1, (0, common_1.Param)('reportId')),
    __param(2, (0, get_user_decorator_1.GetUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object]),
    __metadata("design:returntype", void 0)
], SurveyDataController.prototype, "deleteReport", null);
__decorate([
    (0, common_1.Post)('cross-sections'),
    __param(0, (0, common_1.Param)('inspectionId')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, get_user_decorator_1.GetUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, create_cross_section_dto_1.CreateCrossSectionDto, Object]),
    __metadata("design:returntype", void 0)
], SurveyDataController.prototype, "addCrossSection", null);
__decorate([
    (0, common_1.Get)('cross-sections'),
    __param(0, (0, common_1.Param)('inspectionId')),
    __param(1, (0, get_user_decorator_1.GetUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], SurveyDataController.prototype, "getCrossSections", null);
__decorate([
    (0, common_1.Delete)('cross-sections/:sectionId'),
    __param(0, (0, common_1.Param)('inspectionId')),
    __param(1, (0, common_1.Param)('sectionId')),
    __param(2, (0, get_user_decorator_1.GetUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object]),
    __metadata("design:returntype", void 0)
], SurveyDataController.prototype, "deleteCrossSection", null);
__decorate([
    (0, common_1.Post)('measurements'),
    __param(0, (0, common_1.Param)('inspectionId')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, get_user_decorator_1.GetUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, create_site_measurement_dto_1.CreateSiteMeasurementDto, Object]),
    __metadata("design:returntype", void 0)
], SurveyDataController.prototype, "addMeasurement", null);
__decorate([
    (0, common_1.Get)('measurements'),
    __param(0, (0, common_1.Param)('inspectionId')),
    __param(1, (0, get_user_decorator_1.GetUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], SurveyDataController.prototype, "getMeasurements", null);
__decorate([
    (0, common_1.Delete)('measurements/:measurementId'),
    __param(0, (0, common_1.Param)('inspectionId')),
    __param(1, (0, common_1.Param)('measurementId')),
    __param(2, (0, get_user_decorator_1.GetUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object]),
    __metadata("design:returntype", void 0)
], SurveyDataController.prototype, "deleteMeasurement", null);
exports.SurveyDataController = SurveyDataController = __decorate([
    (0, common_1.Controller)('inspections/:inspectionId/survey'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    __metadata("design:paramtypes", [inspections_service_1.InspectionsService])
], SurveyDataController);
//# sourceMappingURL=survey-data.controller.js.map