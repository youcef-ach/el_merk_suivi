import { Injectable, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProjectDto } from './dto/create-project.dto';

@Injectable()
export class ProjectsService {
  constructor(private prisma: PrismaService) {}

  async create(createProjectDto: CreateProjectDto, userId: string, enterpriseId: string) {
    if (!enterpriseId) throw new ForbiddenException('User is not assigned to an enterprise');
    return this.prisma.project.create({
      data: {
        ...createProjectDto,
        enterpriseId,
      },
    });
  }

  async findAllForEnterprise(enterpriseId: string) {
    if (!enterpriseId) throw new ForbiddenException('User is not assigned to an enterprise');
    return this.prisma.project.findMany({
      where: { enterpriseId },
      include: {
        _count: {
          select: { inspections: true }
        }
      }
    });
  }

  async findOne(id: string, enterpriseId: string) {
    if (!enterpriseId) throw new ForbiddenException('User is not assigned to an enterprise');
    const project = await this.prisma.project.findUnique({
      where: { id },
      include: {
        inspections: true
      }
    });
    
    if (!project) throw new NotFoundException('Project not found');
    if (project.enterpriseId !== enterpriseId) {
       throw new ForbiddenException('You do not have access to this project');
    }
    
    return project;
  }

  async remove(id: string, enterpriseId: string) {
    const project = await this.findOne(id, enterpriseId); // Validates existence & enterprise
    return this.prisma.project.delete({ where: { id: project.id } });
  }
}
