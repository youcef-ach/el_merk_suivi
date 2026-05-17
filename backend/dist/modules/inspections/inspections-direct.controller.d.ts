import { InspectionsService } from './inspections.service';
export declare class InspectionsDirectController {
    private readonly inspectionsService;
    constructor(inspectionsService: InspectionsService);
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
}
