import { ToursService } from './tours.service';
import { CreateTourDto } from './dto/create-tour.dto';
import { CreateScanDto } from './dto/create-scan.dto';
import { CreatePanoramaDto } from './dto/create-panorama.dto';
import { UpdateTourPermissionsDto } from './dto/update-tour-permissions.dto';
export declare class ToursController {
    private readonly toursService;
    constructor(toursService: ToursService);
    create(createTourDto: CreateTourDto, user: any): Promise<{
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
    findAll(user: any): Promise<{
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
    findOne(id: string, user: any): Promise<{
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
    getBundle(id: string, user: any): Promise<{
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
    createScan(id: string, dto: CreateScanDto, user: any): Promise<{
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
    createPanorama(id: string, dto: CreatePanoramaDto, user: any): Promise<{
        id: string;
        tourId: string;
        imageUrl: string;
        status: import(".prisma/client").$Enums.ProcessingStatus;
    }>;
    setPermissions(id: string, dto: UpdateTourPermissionsDto, user: any): Promise<{
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
    remove(id: string, user: any): Promise<{
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
    getUploadUrl(id: string, fileName: string, user: any): Promise<{
        presignedUrl: string;
        expectedPath: string;
    }>;
}
