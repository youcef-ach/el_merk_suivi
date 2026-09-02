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
        surveyReports: {
            id: string;
            title: string;
            createdAt: Date;
            inspectionId: string;
            fileUrl: string;
            reportType: import(".prisma/client").$Enums.ReportType;
            summary: import("@prisma/client/runtime/library").JsonValue | null;
        }[];
        crossSections: {
            id: string;
            createdAt: Date;
            name: string;
            inspectionId: string;
            startPoint: import("@prisma/client/runtime/library").JsonValue;
            endPoint: import("@prisma/client/runtime/library").JsonValue;
            sampleData: import("@prisma/client/runtime/library").JsonValue;
            length: number;
            minElev: number;
            maxElev: number;
            slope: number;
        }[];
        siteMeasurements: {
            id: string;
            type: string;
            createdAt: Date;
            inspectionId: string;
            points: import("@prisma/client/runtime/library").JsonValue;
            values: import("@prisma/client/runtime/library").JsonValue;
            label: string | null;
        }[];
        stagingProfiles: ({
            stagedItems: {
                id: string;
                type: string | null;
                color: string | null;
                isPolyHaven: boolean;
                isSketchfab: boolean;
                polyHavenId: string | null;
                sketchfabId: string | null;
                dimensions: import("@prisma/client/runtime/library").JsonValue | null;
                positionX: number;
                positionY: number;
                positionZ: number;
                rotationX: number;
                rotationY: number;
                rotationZ: number;
                scaleX: number;
                scaleY: number;
                scaleZ: number;
                stagingProfileId: string;
            }[];
            bakedPanoramas: {
                id: string;
                imageUrl: string;
                stagingProfileId: string;
                scanId: string;
                face: string;
            }[];
        } & {
            id: string;
            createdAt: Date;
            updatedAt: Date;
            name: string;
            inspectionId: string;
        })[];
    } & {
        id: string;
        type: import(".prisma/client").$Enums.InspectionType;
        title: string;
        description: string | null;
        glbModelUrl: string | null;
        scansJsonUrl: string | null;
        rawScansJsonUrl: string | null;
        rawCsvJsonUrl: string | null;
        thumbnailUrl: string | null;
        videoUrl: string | null;
        visibility: import(".prisma/client").$Enums.Visibility;
        surveyDate: Date | null;
        droneModel: string | null;
        gsd: number | null;
        flightAltitude: number | null;
        coordinateSystem: string | null;
        tilesetUrl: string | null;
        orthoUrl: string | null;
        orthoBounds: import("@prisma/client/runtime/library").JsonValue | null;
        dsmUrl: string | null;
        dtmUrl: string | null;
        dsmMinElevation: number | null;
        dsmMaxElevation: number | null;
        contoursUrl: string | null;
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
        surveyReports: {
            id: string;
            title: string;
            createdAt: Date;
            inspectionId: string;
            fileUrl: string;
            reportType: import(".prisma/client").$Enums.ReportType;
            summary: import("@prisma/client/runtime/library").JsonValue | null;
        }[];
        crossSections: {
            id: string;
            createdAt: Date;
            name: string;
            inspectionId: string;
            startPoint: import("@prisma/client/runtime/library").JsonValue;
            endPoint: import("@prisma/client/runtime/library").JsonValue;
            sampleData: import("@prisma/client/runtime/library").JsonValue;
            length: number;
            minElev: number;
            maxElev: number;
            slope: number;
        }[];
        siteMeasurements: {
            id: string;
            type: string;
            createdAt: Date;
            inspectionId: string;
            points: import("@prisma/client/runtime/library").JsonValue;
            values: import("@prisma/client/runtime/library").JsonValue;
            label: string | null;
        }[];
        stagingProfiles: ({
            stagedItems: {
                id: string;
                type: string | null;
                color: string | null;
                isPolyHaven: boolean;
                isSketchfab: boolean;
                polyHavenId: string | null;
                sketchfabId: string | null;
                dimensions: import("@prisma/client/runtime/library").JsonValue | null;
                positionX: number;
                positionY: number;
                positionZ: number;
                rotationX: number;
                rotationY: number;
                rotationZ: number;
                scaleX: number;
                scaleY: number;
                scaleZ: number;
                stagingProfileId: string;
            }[];
            bakedPanoramas: {
                id: string;
                imageUrl: string;
                stagingProfileId: string;
                scanId: string;
                face: string;
            }[];
        } & {
            id: string;
            createdAt: Date;
            updatedAt: Date;
            name: string;
            inspectionId: string;
        })[];
    } & {
        id: string;
        type: import(".prisma/client").$Enums.InspectionType;
        title: string;
        description: string | null;
        glbModelUrl: string | null;
        scansJsonUrl: string | null;
        rawScansJsonUrl: string | null;
        rawCsvJsonUrl: string | null;
        thumbnailUrl: string | null;
        videoUrl: string | null;
        visibility: import(".prisma/client").$Enums.Visibility;
        surveyDate: Date | null;
        droneModel: string | null;
        gsd: number | null;
        flightAltitude: number | null;
        coordinateSystem: string | null;
        tilesetUrl: string | null;
        orthoUrl: string | null;
        orthoBounds: import("@prisma/client/runtime/library").JsonValue | null;
        dsmUrl: string | null;
        dtmUrl: string | null;
        dsmMinElevation: number | null;
        dsmMaxElevation: number | null;
        contoursUrl: string | null;
        createdAt: Date;
        updatedAt: Date;
        projectId: string;
    }>;
}
