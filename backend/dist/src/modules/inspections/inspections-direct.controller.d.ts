import { InspectionsService } from './inspections.service';
export declare class InspectionsDirectController {
    private readonly inspectionsService;
    constructor(inspectionsService: InspectionsService);
    findOne(id: string, user: any): Promise<{
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
    getBundle(id: string, user: any): Promise<{
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
}
