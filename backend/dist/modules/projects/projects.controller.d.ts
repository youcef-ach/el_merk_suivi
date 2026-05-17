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
    remove(id: string, user: any): Promise<{
        enterpriseId: string;
        id: string;
        createdAt: Date;
        name: string;
        description: string | null;
        updatedAt: Date;
    }>;
}
