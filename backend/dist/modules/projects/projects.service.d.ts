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
            type: import(".prisma/client").$Enums.InspectionType;
            title: string;
            description: string | null;
            glbModelUrl: string | null;
            scansJsonUrl: string | null;
            rawScansJsonUrl: string | null;
            rawCsvJsonUrl: string | null;
            thumbnailUrl: string | null;
            videoUrl: string | null;
            visibility: import(".prisma/client").$Enums.Visibility;
            processingStatus: string;
            processingProgress: number;
            processingStage: string;
            processingError: string | null;
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
