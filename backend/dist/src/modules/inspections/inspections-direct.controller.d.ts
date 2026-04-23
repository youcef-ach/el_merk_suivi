import { InspectionsService } from './inspections.service';
export declare class InspectionsDirectController {
    private readonly inspectionsService;
    constructor(inspectionsService: InspectionsService);
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
}
