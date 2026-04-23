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
exports.ProjectsService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
let ProjectsService = class ProjectsService {
    constructor(prisma) {
        this.prisma = prisma;
    }
    async create(createProjectDto, userId, enterpriseId) {
        if (!enterpriseId)
            throw new common_1.ForbiddenException('User is not assigned to an enterprise');
        return this.prisma.project.create({
            data: {
                ...createProjectDto,
                enterpriseId,
            },
        });
    }
    async findAllForEnterprise(enterpriseId) {
        if (!enterpriseId)
            throw new common_1.ForbiddenException('User is not assigned to an enterprise');
        return this.prisma.project.findMany({
            where: { enterpriseId },
            include: {
                _count: {
                    select: { inspections: true }
                }
            }
        });
    }
    async findOne(id, enterpriseId) {
        if (!enterpriseId)
            throw new common_1.ForbiddenException('User is not assigned to an enterprise');
        const project = await this.prisma.project.findUnique({
            where: { id },
            include: {
                inspections: true
            }
        });
        if (!project)
            throw new common_1.NotFoundException('Project not found');
        if (project.enterpriseId !== enterpriseId) {
            throw new common_1.ForbiddenException('You do not have access to this project');
        }
        return project;
    }
    async remove(id, enterpriseId) {
        const project = await this.findOne(id, enterpriseId);
        return this.prisma.project.delete({ where: { id: project.id } });
    }
};
exports.ProjectsService = ProjectsService;
exports.ProjectsService = ProjectsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], ProjectsService);
//# sourceMappingURL=projects.service.js.map