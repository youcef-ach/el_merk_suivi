import { InspectionsService } from './inspections.service';
import { CreateInspectionDto } from './dto/create-inspection.dto';
import { CreateScanDto } from './dto/create-scan.dto';
import { CreatePanoramaDto } from './dto/create-panorama.dto';
import { UpdateInspectionPermissionsDto } from './dto/update-inspection-permissions.dto';
export declare class InspectionsController {
    private readonly inspectionsService;
    constructor(inspectionsService: InspectionsService);
    create(projectId: string, createInspectionDto: CreateInspectionDto, user: any): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        title: string;
        description: string | null;
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
        updatedAt: Date;
        title: string;
        description: string | null;
        glbModelUrl: string | null;
        scansJsonUrl: string | null;
        thumbnailUrl: string | null;
        videoUrl: string | null;
        visibility: import(".prisma/client").$Enums.Visibility;
        projectId: string;
    }[]>;
    findOne(id: string, user: any): Promise<{
        project: {
            id: string;
            name: string;
            createdAt: Date;
            updatedAt: Date;
            description: string | null;
            enterpriseId: string;
        };
        authorizedViewers: {
            id: string;
            createdAt: Date;
            enterpriseId: string | null;
            email: string;
            password: string;
            role: import(".prisma/client").$Enums.Role;
        }[];
        panoramas: {
            id: string;
            inspectionId: string;
            imageUrl: string;
            status: import(".prisma/client").$Enums.ProcessingStatus;
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
            color: string;
            posX: number;
            posY: number;
            posZ: number;
            inspectionId: string;
            title: string;
            description: string | null;
            icon: string;
            size: number;
        })[];
        scans: {
            id: string;
            posX: number;
            posY: number;
            posZ: number;
            inspectionId: string;
            quatW: number;
            quatX: number;
            quatY: number;
            quatZ: number;
            targetScanId: string | null;
        }[];
        areaPointers: {
            id: string;
            name: string;
            color: string;
            posX: number;
            posY: number;
            posZ: number;
            height: number;
            thickness: number;
            labelSize: number;
            sizeX: number;
            sizeY: number;
            wallHeight: number;
            createdAt: Date;
            updatedAt: Date;
            inspectionId: string;
        }[];
    } & {
        id: string;
        createdAt: Date;
        updatedAt: Date;
        title: string;
        description: string | null;
        glbModelUrl: string | null;
        scansJsonUrl: string | null;
        thumbnailUrl: string | null;
        videoUrl: string | null;
        visibility: import(".prisma/client").$Enums.Visibility;
        projectId: string;
    }>;
    getBundle(id: string, user: any): Promise<{
        project: {
            id: string;
            name: string;
            createdAt: Date;
            updatedAt: Date;
            description: string | null;
            enterpriseId: string;
        };
        authorizedViewers: {
            id: string;
            createdAt: Date;
            enterpriseId: string | null;
            email: string;
            password: string;
            role: import(".prisma/client").$Enums.Role;
        }[];
        panoramas: {
            id: string;
            inspectionId: string;
            imageUrl: string;
            status: import(".prisma/client").$Enums.ProcessingStatus;
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
            color: string;
            posX: number;
            posY: number;
            posZ: number;
            inspectionId: string;
            title: string;
            description: string | null;
            icon: string;
            size: number;
        })[];
        scans: {
            id: string;
            posX: number;
            posY: number;
            posZ: number;
            inspectionId: string;
            quatW: number;
            quatX: number;
            quatY: number;
            quatZ: number;
            targetScanId: string | null;
        }[];
        areaPointers: {
            id: string;
            name: string;
            color: string;
            posX: number;
            posY: number;
            posZ: number;
            height: number;
            thickness: number;
            labelSize: number;
            sizeX: number;
            sizeY: number;
            wallHeight: number;
            createdAt: Date;
            updatedAt: Date;
            inspectionId: string;
        }[];
    } & {
        id: string;
        createdAt: Date;
        updatedAt: Date;
        title: string;
        description: string | null;
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
        inspectionId: string;
        quatW: number;
        quatX: number;
        quatY: number;
        quatZ: number;
        targetScanId: string | null;
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
            enterpriseId: string | null;
            email: string;
            password: string;
            role: import(".prisma/client").$Enums.Role;
        }[];
    } & {
        id: string;
        createdAt: Date;
        updatedAt: Date;
        title: string;
        description: string | null;
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
        updatedAt: Date;
        title: string;
        description: string | null;
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
        updatedAt: Date;
        title: string;
        description: string | null;
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
}
