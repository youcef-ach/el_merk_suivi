import { ProjectsService } from './projects.service';
import { CreateProjectDto } from './dto/create-project.dto';
export declare class ProjectsController {
    private readonly projectsService;
    constructor(projectsService: ProjectsService);
    create(createProjectDto: CreateProjectDto, user: any): Promise<{
        id: string;
        name: string;
        createdAt: Date;
        updatedAt: Date;
        enterpriseId: string;
        description: string | null;
    }>;
    findAll(user: any): Promise<({
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
    findOne(id: string, user: any): Promise<{
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
    remove(id: string, user: any): Promise<{
        id: string;
        name: string;
        createdAt: Date;
        updatedAt: Date;
        enterpriseId: string;
        description: string | null;
    }>;
}
