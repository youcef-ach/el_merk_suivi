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
exports.EnterprisesService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
const bcrypt = require("bcrypt");
let EnterprisesService = class EnterprisesService {
    constructor(prisma) {
        this.prisma = prisma;
    }
    async create(createEnterpriseDto) {
        return this.prisma.enterprise.create({
            data: createEnterpriseDto,
        });
    }
    async findAll() {
        return this.prisma.enterprise.findMany();
    }
    async findOne(id) {
        const enterprise = await this.prisma.enterprise.findUnique({
            where: { id },
        });
        if (!enterprise)
            throw new common_1.NotFoundException('Enterprise not found');
        return enterprise;
    }
    async addMember(dto, callerEnterpriseId) {
        if (!callerEnterpriseId) {
            throw new common_1.ForbiddenException('You are not assigned to an enterprise');
        }
        const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
        if (existing) {
            throw new common_1.ConflictException('A user with this email already exists');
        }
        const hashedPassword = await bcrypt.hash(dto.password, 10);
        return this.prisma.user.create({
            data: {
                email: dto.email,
                password: hashedPassword,
                role: dto.role,
                enterpriseId: callerEnterpriseId,
            },
            select: {
                id: true,
                email: true,
                role: true,
                createdAt: true,
            },
        });
    }
    async getMembers(enterpriseId) {
        if (!enterpriseId) {
            throw new common_1.ForbiddenException('You are not assigned to an enterprise');
        }
        return this.prisma.user.findMany({
            where: { enterpriseId },
            select: {
                id: true,
                email: true,
                role: true,
                createdAt: true,
            },
            orderBy: { createdAt: 'asc' },
        });
    }
    async removeMember(memberId, callerEnterpriseId, callerId) {
        if (memberId === callerId) {
            throw new common_1.ForbiddenException('You cannot remove yourself');
        }
        const member = await this.prisma.user.findUnique({ where: { id: memberId } });
        if (!member)
            throw new common_1.NotFoundException('User not found');
        if (member.enterpriseId !== callerEnterpriseId) {
            throw new common_1.ForbiddenException('This user does not belong to your enterprise');
        }
        return this.prisma.user.delete({ where: { id: memberId } });
    }
};
exports.EnterprisesService = EnterprisesService;
exports.EnterprisesService = EnterprisesService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], EnterprisesService);
//# sourceMappingURL=enterprises.service.js.map