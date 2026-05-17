import { PrismaService } from '../prisma/prisma.service';
import { CreateProjectDto } from './dto/create-project.dto';
export declare class ProjectsService {
    private prisma;
    constructor(prisma: PrismaService);
    create(createProjectDto: CreateProjectDto, userId: string, enterpriseId: string): Promise<{
        enterpriseId: string;
        id: string;
        createdAt: Date;
        name: string;
        description: string | null;
        updatedAt: Date;
    }>;
    findAllForEnterprise(enterpriseId: string): Promise<({
        _count: {
            inspections: number;
        };
    } & {
        enterpriseId: string;
        id: string;
        createdAt: Date;
        name: string;
        description: string | null;
        updatedAt: Date;
    })[]>;
    findOne(id: string, enterpriseId: string): Promise<{
        inspections: {
            id: string;
            createdAt: Date;
            description: string | null;
            updatedAt: Date;
            title: string;
            glbModelUrl: string | null;
            scansJsonUrl: string | null;
            thumbnailUrl: string | null;
            videoUrl: string | null;
            visibility: import(".prisma/client").$Enums.Visibility;
            projectId: string;
        }[];
    } & {
        enterpriseId: string;
        id: string;
        createdAt: Date;
        name: string;
        description: string | null;
        updatedAt: Date;
    }>;
    remove(id: string, enterpriseId: string): Promise<{
        enterpriseId: string;
        id: string;
        createdAt: Date;
        name: string;
        description: string | null;
        updatedAt: Date;
    }>;
}
