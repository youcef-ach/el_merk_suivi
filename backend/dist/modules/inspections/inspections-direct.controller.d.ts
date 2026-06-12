import { InspectionsService } from './inspections.service';
export declare class InspectionsDirectController {
    private readonly inspectionsService;
    constructor(inspectionsService: InspectionsService);
    findOne(id: string, user: any): Promise<{
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
    }>;
    getBundle(id: string, user: any): Promise<{
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
    }>;
}
