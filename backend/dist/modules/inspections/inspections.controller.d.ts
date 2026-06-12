import { InspectionsService } from './inspections.service';
import { CreateInspectionDto } from './dto/create-inspection.dto';
import { CreateScanDto } from './dto/create-scan.dto';
import { CreatePanoramaDto } from './dto/create-panorama.dto';
import { UpdateInspectionPermissionsDto } from './dto/update-inspection-permissions.dto';
import { ProcessScansDto } from './dto/process-scans.dto';
export declare class InspectionsController {
    private readonly inspectionsService;
    constructor(inspectionsService: InspectionsService);
    create(projectId: string, createInspectionDto: CreateInspectionDto, user: any): Promise<{
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
    findAll(projectId: string, user: any): Promise<{
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
    }[]>;
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
    clone(id: string, user: any): Promise<{
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
    createScan(id: string, dto: CreateScanDto, user: any): Promise<{
        id: string;
        posX: number;
        posY: number;
        posZ: number;
        quatW: number;
        quatX: number;
        quatY: number;
        quatZ: number;
        targetScanId: string | null;
        inspectionId: string;
    }>;
    createPanorama(id: string, dto: CreatePanoramaDto, user: any): Promise<{
        id: string;
        inspectionId: string;
        imageUrl: string;
        status: import(".prisma/client").$Enums.ProcessingStatus;
    }>;
    setPermissions(id: string, dto: UpdateInspectionPermissionsDto, user: any): Promise<{
        authorizedViewers: {
            id: string;
            createdAt: Date;
            email: string;
            password: string;
            role: import(".prisma/client").$Enums.Role;
            enterpriseId: string | null;
        }[];
    } & {
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
    updateInspection(id: string, dto: any, user: any): Promise<{
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
    remove(id: string, user: any): Promise<{
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
    getUploadUrl(id: string, fileName: string, user: any): Promise<{
        presignedUrl: string;
        expectedPath: string;
    }>;
    processAndUploadScans(id: string, body: ProcessScansDto, user: any): Promise<{
        success: boolean;
        s3Path: string;
        rawScansS3Path: string;
        rawCsvS3Path: string;
    }>;
    processGlb(id: string, user: any): Promise<{
        success: boolean;
        optimizedUrl: string;
    }>;
}
