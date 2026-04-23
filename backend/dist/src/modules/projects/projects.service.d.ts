import { PrismaService } from '../prisma/prisma.service';
import { CreateProjectDto } from './dto/create-project.dto';
export declare class ProjectsService {
    private prisma;
    constructor(prisma: PrismaService);
    create(createProjectDto: CreateProjectDto, userId: string, enterpriseId: string): Promise<{
        id: string;
        name: string;
        createdAt: Date;
        updatedAt: Date;
        enterpriseId: string;
        description: string | null;
    }>;
    findAllForEnterprise(enterpriseId: string): Promise<({
        _count: {
            inspections: number;
        };
    } & {
        id: string;
        name: string;
        createdAt: Date;
        updatedAt: Date;
        enterpriseId: string;
        description: string | null;
    })[]>;
    findOne(id: string, enterpriseId: string): Promise<{
        inspections: {
            id: string;
            createdAt: Date;
            updatedAt: Date;
            description: string | null;
            title: string;
            visibility: import(".prisma/client").$Enums.Visibility;
            glbModelUrl: string | null;
            scansJsonUrl: string | null;
            thumbnailUrl: string | null;
            videoUrl: string | null;
            projectId: string;
        }[];
    } & {
        id: string;
        name: string;
        createdAt: Date;
        updatedAt: Date;
        enterpriseId: string;
        description: string | null;
    }>;
    remove(id: string, enterpriseId: string): Promise<{
        id: string;
        name: string;
        createdAt: Date;
        updatedAt: Date;
        enterpriseId: string;
        description: string | null;
    }>;
}
