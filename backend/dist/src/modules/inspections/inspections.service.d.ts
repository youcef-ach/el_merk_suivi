import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { CreateInspectionDto } from './dto/create-inspection.dto';
import { CreateScanDto } from './dto/create-scan.dto';
import { CreatePanoramaDto } from './dto/create-panorama.dto';
import { CreateTagDto } from './dto/create-tag.dto';
import { UpdateTagDto } from './dto/update-tag.dto';
import { CreateTagDocumentDto } from './dto/create-tag-document.dto';
import { UpdateInspectionPermissionsDto } from './dto/update-inspection-permissions.dto';
import { UpdatePanoramaStatusDto } from './dto/update-panorama-status.dto';
import { CreateAreaPointerDto } from './dto/create-area-pointer.dto';
import { UpdateAreaPointerDto } from './dto/update-area-pointer.dto';
import { Role } from '@prisma/client';
export declare class InspectionsService {
    private prisma;
    private storageService;
    constructor(prisma: PrismaService, storageService: StorageService);
    create(projectId: string, createInspectionDto: CreateInspectionDto, userEnterpriseId: string): Promise<{
        id: string;
        title: string;
        description: string | null;
        glbModelUrl: string | null;
        scansJsonUrl: string | null;
        thumbnailUrl: string | null;
        videoUrl: string | null;
        visibility: import(".prisma/client").$Enums.Visibility;
        createdAt: Date;
        updatedAt: Date;
        projectId: string;
    }>;
    findAll(projectId: string, user?: {
        id: string;
        role: Role;
    }): Promise<{
        id: string;
        title: string;
        description: string | null;
        glbModelUrl: string | null;
        scansJsonUrl: string | null;
        thumbnailUrl: string | null;
        videoUrl: string | null;
        visibility: import(".prisma/client").$Enums.Visibility;
        createdAt: Date;
        updatedAt: Date;
        projectId: string;
    }[]>;
    findOne(id: string, user?: {
        id: string;
        role: Role;
        enterpriseId?: string;
    }): Promise<{
        project: {
            id: string;
            description: string | null;
            createdAt: Date;
            updatedAt: Date;
            name: string;
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
            title: string;
            description: string | null;
            inspectionId: string;
            posX: number;
            posY: number;
            posZ: number;
            icon: string;
            color: string;
            size: number;
        })[];
        scans: {
            id: string;
            inspectionId: string;
            posX: number;
            posY: number;
            posZ: number;
            quatW: number;
            quatX: number;
            quatY: number;
            quatZ: number;
            targetScanId: string | null;
        }[];
        areaPointers: {
            id: string;
            createdAt: Date;
            updatedAt: Date;
            name: string;
            inspectionId: string;
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
        }[];
    } & {
        id: string;
        title: string;
        description: string | null;
        glbModelUrl: string | null;
        scansJsonUrl: string | null;
        thumbnailUrl: string | null;
        videoUrl: string | null;
        visibility: import(".prisma/client").$Enums.Visibility;
        createdAt: Date;
        updatedAt: Date;
        projectId: string;
    }>;
    getBundle(id: string, user?: {
        id: string;
        role: Role;
    }): Promise<{
        project: {
            id: string;
            description: string | null;
            createdAt: Date;
            updatedAt: Date;
            name: string;
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
            title: string;
            description: string | null;
            inspectionId: string;
            posX: number;
            posY: number;
            posZ: number;
            icon: string;
            color: string;
            size: number;
        })[];
        scans: {
            id: string;
            inspectionId: string;
            posX: number;
            posY: number;
            posZ: number;
            quatW: number;
            quatX: number;
            quatY: number;
            quatZ: number;
            targetScanId: string | null;
        }[];
        areaPointers: {
            id: string;
            createdAt: Date;
            updatedAt: Date;
            name: string;
            inspectionId: string;
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
        }[];
    } & {
        id: string;
        title: string;
        description: string | null;
        glbModelUrl: string | null;
        scansJsonUrl: string | null;
        thumbnailUrl: string | null;
        videoUrl: string | null;
        visibility: import(".prisma/client").$Enums.Visibility;
        createdAt: Date;
        updatedAt: Date;
        projectId: string;
    }>;
    createScan(inspectionId: string, dto: CreateScanDto, userEnterpriseId: string, role: Role): Promise<{
        id: string;
        inspectionId: string;
        posX: number;
        posY: number;
        posZ: number;
        quatW: number;
        quatX: number;
        quatY: number;
        quatZ: number;
        targetScanId: string | null;
    }>;
    createPanorama(inspectionId: string, dto: CreatePanoramaDto, userEnterpriseId: string, role: Role): Promise<{
        id: string;
        imageUrl: string;
        status: import(".prisma/client").$Enums.ProcessingStatus;
        inspectionId: string;
    }>;
    updatePanoramaStatus(id: string, dto: UpdatePanoramaStatusDto, role: Role): Promise<{
        id: string;
        imageUrl: string;
        status: import(".prisma/client").$Enums.ProcessingStatus;
        inspectionId: string;
    }>;
    setPermissions(id: string, dto: UpdateInspectionPermissionsDto, userEnterpriseId: string, role: Role): Promise<{
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
        title: string;
        description: string | null;
        glbModelUrl: string | null;
        scansJsonUrl: string | null;
        thumbnailUrl: string | null;
        videoUrl: string | null;
        visibility: import(".prisma/client").$Enums.Visibility;
        createdAt: Date;
        updatedAt: Date;
        projectId: string;
    }>;
    remove(id: string, userEnterpriseId: string, role: Role): Promise<{
        id: string;
        title: string;
        description: string | null;
        glbModelUrl: string | null;
        scansJsonUrl: string | null;
        thumbnailUrl: string | null;
        videoUrl: string | null;
        visibility: import(".prisma/client").$Enums.Visibility;
        createdAt: Date;
        updatedAt: Date;
        projectId: string;
    }>;
    update(id: string, dto: any, enterpriseId: string, role: Role): Promise<{
        id: string;
        title: string;
        description: string | null;
        glbModelUrl: string | null;
        scansJsonUrl: string | null;
        thumbnailUrl: string | null;
        videoUrl: string | null;
        visibility: import(".prisma/client").$Enums.Visibility;
        createdAt: Date;
        updatedAt: Date;
        projectId: string;
    }>;
    getUploadUrl(id: string, fileName: string, userEnterpriseId: string, role: Role): Promise<{
        presignedUrl: string;
        expectedPath: string;
    }>;
    processAndUploadScans(id: string, mpData: any, rcData: any, userEnterpriseId: string, role: Role): Promise<{
        success: boolean;
        s3Path: string;
    }>;
    createTag(inspectionId: string, dto: CreateTagDto, userEnterpriseId: string, role: Role): Promise<{
        documents: {
            id: string;
            title: string;
            fileUrl: string;
            tagId: string;
        }[];
    } & {
        id: string;
        title: string;
        description: string | null;
        inspectionId: string;
        posX: number;
        posY: number;
        posZ: number;
        icon: string;
        color: string;
        size: number;
    }>;
    updateTag(inspectionId: string, tagId: string, dto: UpdateTagDto, userEnterpriseId: string, role: Role): Promise<{
        documents: {
            id: string;
            title: string;
            fileUrl: string;
            tagId: string;
        }[];
    } & {
        id: string;
        title: string;
        description: string | null;
        inspectionId: string;
        posX: number;
        posY: number;
        posZ: number;
        icon: string;
        color: string;
        size: number;
    }>;
    deleteTag(inspectionId: string, tagId: string, userEnterpriseId: string, role: Role): Promise<{
        id: string;
        title: string;
        description: string | null;
        inspectionId: string;
        posX: number;
        posY: number;
        posZ: number;
        icon: string;
        color: string;
        size: number;
    }>;
    addTagDocument(inspectionId: string, tagId: string, dto: CreateTagDocumentDto, userEnterpriseId: string, role: Role): Promise<{
        presignedUrl: string;
        document: {
            id: string;
            title: string;
            fileUrl: string;
            tagId: string;
        };
    }>;
    deleteTagDocument(inspectionId: string, tagId: string, docId: string, userEnterpriseId: string, role: Role): Promise<{
        id: string;
        title: string;
        fileUrl: string;
        tagId: string;
    }>;
    createAreaPointer(inspectionId: string, dto: CreateAreaPointerDto, userEnterpriseId: string, role: Role): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        name: string;
        inspectionId: string;
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
    }>;
    updateAreaPointer(inspectionId: string, pointerId: string, dto: UpdateAreaPointerDto, userEnterpriseId: string, role: Role): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        name: string;
        inspectionId: string;
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
    }>;
    deleteAreaPointer(inspectionId: string, pointerId: string, userEnterpriseId: string, role: Role): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        name: string;
        inspectionId: string;
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
    }>;
}
