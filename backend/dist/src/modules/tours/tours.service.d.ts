import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { CreateTourDto } from './dto/create-tour.dto';
import { CreateScanDto } from './dto/create-scan.dto';
import { CreatePanoramaDto } from './dto/create-panorama.dto';
import { CreateTagDto } from './dto/create-tag.dto';
import { UpdateTagDto } from './dto/update-tag.dto';
import { CreateTagDocumentDto } from './dto/create-tag-document.dto';
import { UpdateTourPermissionsDto } from './dto/update-tour-permissions.dto';
import { UpdatePanoramaStatusDto } from './dto/update-panorama-status.dto';
import { CreateAreaPointerDto } from './dto/create-area-pointer.dto';
import { UpdateAreaPointerDto } from './dto/update-area-pointer.dto';
import { Role } from '@prisma/client';
export declare class ToursService {
    private prisma;
    private storageService;
    constructor(prisma: PrismaService, storageService: StorageService);
    create(createTourDto: CreateTourDto, creatorId: string): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        title: string;
        description: string | null;
        visibility: import(".prisma/client").$Enums.Visibility;
        glbModelUrl: string | null;
        scansJsonUrl: string | null;
        creatorId: string;
    }>;
    findAll(user?: {
        id: string;
        role: Role;
    }): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        title: string;
        description: string | null;
        visibility: import(".prisma/client").$Enums.Visibility;
        glbModelUrl: string | null;
        scansJsonUrl: string | null;
        creatorId: string;
    }[]>;
    findOne(id: string, user?: {
        id: string;
        role: Role;
    }): Promise<{
        authorizedViewers: {
            id: string;
            createdAt: Date;
            email: string;
            password: string;
            role: import(".prisma/client").$Enums.Role;
        }[];
        panoramas: {
            id: string;
            tourId: string;
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
            tourId: string;
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
            tourId: string;
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
            tourId: string;
            createdAt: Date;
            updatedAt: Date;
        }[];
    } & {
        id: string;
        createdAt: Date;
        updatedAt: Date;
        title: string;
        description: string | null;
        visibility: import(".prisma/client").$Enums.Visibility;
        glbModelUrl: string | null;
        scansJsonUrl: string | null;
        creatorId: string;
    }>;
    getBundle(id: string, user?: {
        id: string;
        role: Role;
    }): Promise<{
        authorizedViewers: {
            id: string;
            createdAt: Date;
            email: string;
            password: string;
            role: import(".prisma/client").$Enums.Role;
        }[];
        panoramas: {
            id: string;
            tourId: string;
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
            tourId: string;
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
            tourId: string;
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
            tourId: string;
            createdAt: Date;
            updatedAt: Date;
        }[];
    } & {
        id: string;
        createdAt: Date;
        updatedAt: Date;
        title: string;
        description: string | null;
        visibility: import(".prisma/client").$Enums.Visibility;
        glbModelUrl: string | null;
        scansJsonUrl: string | null;
        creatorId: string;
    }>;
    createScan(tourId: string, dto: CreateScanDto, userId: string, role: Role): Promise<{
        id: string;
        posX: number;
        posY: number;
        posZ: number;
        tourId: string;
        quatW: number;
        quatX: number;
        quatY: number;
        quatZ: number;
        targetScanId: string | null;
    }>;
    createPanorama(tourId: string, dto: CreatePanoramaDto, userId: string, role: Role): Promise<{
        id: string;
        tourId: string;
        imageUrl: string;
        status: import(".prisma/client").$Enums.ProcessingStatus;
    }>;
    updatePanoramaStatus(id: string, dto: UpdatePanoramaStatusDto, role: Role): Promise<{
        id: string;
        tourId: string;
        imageUrl: string;
        status: import(".prisma/client").$Enums.ProcessingStatus;
    }>;
    setPermissions(id: string, dto: UpdateTourPermissionsDto, userId: string, role: Role): Promise<{
        authorizedViewers: {
            id: string;
            createdAt: Date;
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
        visibility: import(".prisma/client").$Enums.Visibility;
        glbModelUrl: string | null;
        scansJsonUrl: string | null;
        creatorId: string;
    }>;
    remove(id: string, userId: string, role: Role): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        title: string;
        description: string | null;
        visibility: import(".prisma/client").$Enums.Visibility;
        glbModelUrl: string | null;
        scansJsonUrl: string | null;
        creatorId: string;
    }>;
    getUploadUrl(id: string, fileName: string, userId: string, role: Role): Promise<{
        presignedUrl: string;
        expectedPath: string;
    }>;
    createTag(tourId: string, dto: CreateTagDto, userId: string, role: Role): Promise<{
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
        tourId: string;
        title: string;
        description: string | null;
        icon: string;
        size: number;
    }>;
    updateTag(tourId: string, tagId: string, dto: UpdateTagDto, userId: string, role: Role): Promise<{
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
        tourId: string;
        title: string;
        description: string | null;
        icon: string;
        size: number;
    }>;
    deleteTag(tourId: string, tagId: string, userId: string, role: Role): Promise<{
        id: string;
        color: string;
        posX: number;
        posY: number;
        posZ: number;
        tourId: string;
        title: string;
        description: string | null;
        icon: string;
        size: number;
    }>;
    addTagDocument(tourId: string, tagId: string, dto: CreateTagDocumentDto, userId: string, role: Role): Promise<{
        presignedUrl: string;
        document: {
            id: string;
            title: string;
            fileUrl: string;
            tagId: string;
        };
    }>;
    deleteTagDocument(tourId: string, tagId: string, docId: string, userId: string, role: Role): Promise<{
        id: string;
        title: string;
        fileUrl: string;
        tagId: string;
    }>;
    createAreaPointer(tourId: string, dto: CreateAreaPointerDto, userId: string, role: Role): Promise<{
        id: string;
        name: string;
        color: string;
        posX: number;
        posY: number;
        posZ: number;
        height: number;
        thickness: number;
        labelSize: number;
        tourId: string;
        createdAt: Date;
        updatedAt: Date;
    }>;
    updateAreaPointer(tourId: string, pointerId: string, dto: UpdateAreaPointerDto, userId: string, role: Role): Promise<{
        id: string;
        name: string;
        color: string;
        posX: number;
        posY: number;
        posZ: number;
        height: number;
        thickness: number;
        labelSize: number;
        tourId: string;
        createdAt: Date;
        updatedAt: Date;
    }>;
    deleteAreaPointer(tourId: string, pointerId: string, userId: string, role: Role): Promise<{
        id: string;
        name: string;
        color: string;
        posX: number;
        posY: number;
        posZ: number;
        height: number;
        thickness: number;
        labelSize: number;
        tourId: string;
        createdAt: Date;
        updatedAt: Date;
    }>;
}
