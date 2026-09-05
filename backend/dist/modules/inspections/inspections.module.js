"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.InspectionsModule = void 0;
const common_1 = require("@nestjs/common");
const inspections_service_1 = require("./inspections.service");
const inspections_controller_1 = require("./inspections.controller");
const inspections_direct_controller_1 = require("./inspections-direct.controller");
const tags_controller_1 = require("./tags.controller");
const area_pointers_controller_1 = require("./area-pointers.controller");
const panoramas_controller_1 = require("./panoramas.controller");
const staging_controller_1 = require("./staging.controller");
const survey_data_controller_1 = require("./survey-data.controller");
const prisma_module_1 = require("../prisma/prisma.module");
const storage_module_1 = require("../storage/storage.module");
const queues_module_1 = require("../queues/queues.module");
let InspectionsModule = class InspectionsModule {
};
exports.InspectionsModule = InspectionsModule;
exports.InspectionsModule = InspectionsModule = __decorate([
    (0, common_1.Module)({
        imports: [
            prisma_module_1.PrismaModule,
            storage_module_1.StorageModule,
            (0, common_1.forwardRef)(() => queues_module_1.QueuesModule),
        ],
        controllers: [
            inspections_controller_1.InspectionsController,
            inspections_direct_controller_1.InspectionsDirectController,
            tags_controller_1.TagsController,
            panoramas_controller_1.PanoramasController,
            area_pointers_controller_1.AreaPointersController,
            staging_controller_1.StagingController,
            survey_data_controller_1.SurveyDataController,
        ],
        providers: [inspections_service_1.InspectionsService],
        exports: [inspections_service_1.InspectionsService],
    })
], InspectionsModule);
//# sourceMappingURL=inspections.module.js.map