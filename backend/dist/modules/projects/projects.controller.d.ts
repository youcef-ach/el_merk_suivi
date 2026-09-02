import { ProjectsService } from './projects.service';
import { CreateProjectDto } from './dto/create-project.dto';
export declare class ProjectsController {
    private readonly projectsService;
    constructor(projectsService: ProjectsService);
    create(createProjectDto: CreateProjectDto, user: any): Promise<{
        enterpriseId: string;
        id: string;
        createdAt: Date;
        name: string;
        description: string | null;
        updatedAt: Date;
    }>;
    findAll(user: any): Promise<({
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
    findOne(id: string, user: any): Promise<{
        inspections: {
            id: string;
            createdAt: Date;
            description: string | null;
            updatedAt: Date;
            type: import(".prisma/client").$Enums.InspectionType;
            title: string;
            visibility: import(".prisma/client").$Enums.Visibility;
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
            contoursUrl: string | null;
            dsmMinElevation: number | null;
            dsmMaxElevation: number | null;
            glbModelUrl: string | null;
            scansJsonUrl: string | null;
            rawScansJsonUrl: string | null;
            rawCsvJsonUrl: string | null;
            thumbnailUrl: string | null;
            videoUrl: string | null;
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
    remove(id: string, user: any): Promise<{
        enterpriseId: string;
        id: string;
        createdAt: Date;
        name: string;
        description: string | null;
        updatedAt: Date;
    }>;
}
