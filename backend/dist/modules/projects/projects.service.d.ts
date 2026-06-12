import { PrismaService } from '../prisma/prisma.service';
import { CreateProjectDto } from './dto/create-project.dto';
export declare class ProjectsService {
    private prisma;
    constructor(prisma: PrismaService);
    create(createProjectDto: CreateProjectDto, userId: string, enterpriseId: string): Promise<{
        id: string;
        description: string | null;
        createdAt: Date;
        updatedAt: Date;
        name: string;
        enterpriseId: string;
    }>;
    findAllForEnterprise(enterpriseId: string): Promise<({
        _count: {
            inspections: number;
        };
    } & {
        id: string;
        description: string | null;
        createdAt: Date;
        updatedAt: Date;
        name: string;
        enterpriseId: string;
    })[]>;
    findOne(id: string, enterpriseId: string): Promise<{
        inspections: {
            id: string;
            title: string;
            description: string | null;
            glbModelUrl: string | null;
            scansJsonUrl: string | null;
            rawScansJsonUrl: string | null;
            rawCsvJsonUrl: string | null;
            thumbnailUrl: string | null;
            videoUrl: string | null;
            visibility: import(".prisma/client").$Enums.Visibility;
            createdAt: Date;
            updatedAt: Date;
            projectId: string;
        }[];
    } & {
        id: string;
        description: string | null;
        createdAt: Date;
        updatedAt: Date;
        name: string;
        enterpriseId: string;
    }>;
    remove(id: string, enterpriseId: string): Promise<{
        id: string;
        description: string | null;
        createdAt: Date;
        updatedAt: Date;
        name: string;
        enterpriseId: string;
    }>;
}
