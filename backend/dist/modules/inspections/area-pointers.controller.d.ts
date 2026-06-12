import { InspectionsService } from './inspections.service';
import { CreateAreaPointerDto } from './dto/create-area-pointer.dto';
import { UpdateAreaPointerDto } from './dto/update-area-pointer.dto';
export declare class AreaPointersController {
    private readonly inspectionsService;
    constructor(inspectionsService: InspectionsService);
    create(inspectionId: string, dto: CreateAreaPointerDto, user: any): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        name: string;
        posX: number;
        posY: number;
        posZ: number;
        inspectionId: string;
        color: string;
        height: number;
        thickness: number;
        labelSize: number;
        sizeX: number;
        sizeY: number;
        wallHeight: number;
    }>;
    update(inspectionId: string, pointerId: string, dto: UpdateAreaPointerDto, user: any): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        name: string;
        posX: number;
        posY: number;
        posZ: number;
        inspectionId: string;
        color: string;
        height: number;
        thickness: number;
        labelSize: number;
        sizeX: number;
        sizeY: number;
        wallHeight: number;
    }>;
    remove(inspectionId: string, pointerId: string, user: any): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        name: string;
        posX: number;
        posY: number;
        posZ: number;
        inspectionId: string;
        color: string;
        height: number;
        thickness: number;
        labelSize: number;
        sizeX: number;
        sizeY: number;
        wallHeight: number;
    }>;
}
