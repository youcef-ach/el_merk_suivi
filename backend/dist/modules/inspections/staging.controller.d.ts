import { InspectionsService } from './inspections.service';
export declare class StagingController {
    private readonly inspectionsService;
    constructor(inspectionsService: InspectionsService);
    createProfile(inspectionId: string, body: {
        name: string;
    }, req: any): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        name: string;
        inspectionId: string;
    }>;
    getProfile(inspectionId: string, profileId: string): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        name: string;
        inspectionId: string;
    }>;
    saveItems(inspectionId: string, profileId: string, body: {
        items: any[];
    }, req: any): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        name: string;
        inspectionId: string;
    }>;
    saveBakedPanoramas(inspectionId: string, profileId: string, body: {
        panoramas: any[];
    }, req: any): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        name: string;
        inspectionId: string;
    }>;
}
