import { InspectionsService } from './inspections.service';
export declare class StagingController {
    private readonly inspectionsService;
    constructor(inspectionsService: InspectionsService);
    createProfile(inspectionId: string, body: {
        name: string;
    }, req: any): Promise<{
        id: string;
        name: string;
        createdAt: Date;
        updatedAt: Date;
        inspectionId: string;
    }>;
    getProfile(inspectionId: string, profileId: string): Promise<{
        stagedItems: {
            id: string;
            isPolyHaven: boolean;
            isSketchfab: boolean;
            polyHavenId: string | null;
            sketchfabId: string | null;
            type: string | null;
            color: string | null;
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
            stagingProfileId: string;
            scanId: string;
            face: string;
            imageUrl: string;
        }[];
    } & {
        id: string;
        name: string;
        createdAt: Date;
        updatedAt: Date;
        inspectionId: string;
    }>;
    saveItems(inspectionId: string, profileId: string, body: {
        items: any[];
    }, req: any): Promise<{
        stagedItems: {
            id: string;
            isPolyHaven: boolean;
            isSketchfab: boolean;
            polyHavenId: string | null;
            sketchfabId: string | null;
            type: string | null;
            color: string | null;
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
            stagingProfileId: string;
            scanId: string;
            face: string;
            imageUrl: string;
        }[];
    } & {
        id: string;
        name: string;
        createdAt: Date;
        updatedAt: Date;
        inspectionId: string;
    }>;
    saveBakedPanoramas(inspectionId: string, profileId: string, body: {
        panoramas: any[];
    }, req: any): Promise<{
        stagedItems: {
            id: string;
            isPolyHaven: boolean;
            isSketchfab: boolean;
            polyHavenId: string | null;
            sketchfabId: string | null;
            type: string | null;
            color: string | null;
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
            stagingProfileId: string;
            scanId: string;
            face: string;
            imageUrl: string;
        }[];
    } & {
        id: string;
        name: string;
        createdAt: Date;
        updatedAt: Date;
        inspectionId: string;
    }>;
    getUploadUrl(id: string, fileName: string, req: any): Promise<{
        presignedUrl: string;
        expectedPath: string;
    }>;
}
