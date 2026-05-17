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
    }>;
    findAll(projectId: string, user: any): Promise<{
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
    }[]>;
    findOne(id: string, user: any): Promise<{
        project: {
            enterpriseId: string;
            id: string;
            createdAt: Date;
            name: string;
            description: string | null;
            updatedAt: Date;
        };
        authorizedViewers: {
            email: string;
            password: string;
            enterpriseId: string | null;
            id: string;
            role: import(".prisma/client").$Enums.Role;
            createdAt: Date;
        }[];
        panoramas: {
            id: string;
            imageUrl: string;
            status: import(".prisma/client").$Enums.ProcessingStatus;
            inspectionId: string;
        }[];
        tags: ({
            documents: {
                id: string;
                title: string;
                fileUrl: string;
                tagId: string;
            }[];
        } & {
            id: string;
            description: string | null;
            title: string;
            posX: number;
            posY: number;
            posZ: number;
            icon: string;
            color: string;
            size: number;
            inspectionId: string;
        })[];
        scans: {
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
        }[];
        areaPointers: {
            id: string;
            createdAt: Date;
            name: string;
            updatedAt: Date;
            posX: number;
            posY: number;
            posZ: number;
            color: string;
            height: number;
            thickness: number;
            labelSize: number;
            sizeX: number;
            sizeY: number;
            wallHeight: number;
            inspectionId: string;
        }[];
    } & {
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
    }>;
    getBundle(id: string, user: any): Promise<{
        project: {
            enterpriseId: string;
            id: string;
            createdAt: Date;
            name: string;
            description: string | null;
            updatedAt: Date;
        };
        authorizedViewers: {
            email: string;
            password: string;
            enterpriseId: string | null;
            id: string;
            role: import(".prisma/client").$Enums.Role;
            createdAt: Date;
        }[];
        panoramas: {
            id: string;
            imageUrl: string;
            status: import(".prisma/client").$Enums.ProcessingStatus;
            inspectionId: string;
        }[];
        tags: ({
            documents: {
                id: string;
                title: string;
                fileUrl: string;
                tagId: string;
            }[];
        } & {
            id: string;
            description: string | null;
            title: string;
            posX: number;
            posY: number;
            posZ: number;
            icon: string;
            color: string;
            size: number;
            inspectionId: string;
        })[];
        scans: {
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
        }[];
        areaPointers: {
            id: string;
            createdAt: Date;
            name: string;
            updatedAt: Date;
            posX: number;
            posY: number;
            posZ: number;
            color: string;
            height: number;
            thickness: number;
            labelSize: number;
            sizeX: number;
            sizeY: number;
            wallHeight: number;
            inspectionId: string;
        }[];
    } & {
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
        imageUrl: string;
        status: import(".prisma/client").$Enums.ProcessingStatus;
        inspectionId: string;
    }>;
    setPermissions(id: string, dto: UpdateInspectionPermissionsDto, user: any): Promise<{
        authorizedViewers: {
            email: string;
            password: string;
            enterpriseId: string | null;
            id: string;
            role: import(".prisma/client").$Enums.Role;
            createdAt: Date;
        }[];
    } & {
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
    }>;
    updateInspection(id: string, dto: any, user: any): Promise<{
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
    }>;
    remove(id: string, user: any): Promise<{
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
    }>;
    getUploadUrl(id: string, fileName: string, user: any): Promise<{
        presignedUrl: string;
        expectedPath: string;
    }>;
    processAndUploadScans(id: string, body: ProcessScansDto, user: any): Promise<{
        success: boolean;
        s3Path: string;
    }>;
}
