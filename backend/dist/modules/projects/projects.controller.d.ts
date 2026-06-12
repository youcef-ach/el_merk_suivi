import { ProjectsService } from './projects.service';
import { CreateProjectDto } from './dto/create-project.dto';
export declare class ProjectsController {
    private readonly projectsService;
    constructor(projectsService: ProjectsService);
    create(createProjectDto: CreateProjectDto, user: any): Promise<{
        id: string;
        description: string | null;
        createdAt: Date;
        updatedAt: Date;
        name: string;
        enterpriseId: string;
    }>;
    findAll(user: any): Promise<({
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
    findOne(id: string, user: any): Promise<{
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
    remove(id: string, user: any): Promise<{
        id: string;
        description: string | null;
        createdAt: Date;
        updatedAt: Date;
        name: string;
        enterpriseId: string;
    }>;
}
