import { PrismaService } from '../prisma/prisma.service';
import { CreateProjectDto } from './dto/create-project.dto';
export declare class ProjectsService {
    private prisma;
    constructor(prisma: PrismaService);
    create(createProjectDto: CreateProjectDto, userId: string, enterpriseId: string): Promise<{
        id: string;
        enterpriseId: string;
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
        id: string;
        enterpriseId: string;
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
            visibility: import(".prisma/client").$Enums.Visibility;
            glbModelUrl: string | null;
            scansJsonUrl: string | null;
            rawScansJsonUrl: string | null;
            rawCsvJsonUrl: string | null;
            thumbnailUrl: string | null;
            videoUrl: string | null;
            surveyDate: Date | null;
            droneModel: string | null;
            gsd: number | null;
            flightAltitude: number | null;
            coordinateSystem: string | null;
            tilesetUrl: string | null;
            orthoUrl: string | null;
            orthoBounds: import("@prisma/client/runtime/library").JsonValue | null;
            dsmUrl: string | null;
            dtmUrl: string | null;
            dsmMinElevation: number | null;
            dsmMaxElevation: number | null;
            contoursUrl: string | null;
            projectId: string;
        }[];
    } & {
        id: string;
        enterpriseId: string;
        createdAt: Date;
        name: string;
        description: string | null;
        updatedAt: Date;
    }>;
    remove(id: string, enterpriseId: string): Promise<{
        id: string;
        enterpriseId: string;
        createdAt: Date;
        name: string;
        description: string | null;
        updatedAt: Date;
    }>;
}
