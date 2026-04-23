import { InspectionsService } from './inspections.service';
import { CreateAreaPointerDto } from './dto/create-area-pointer.dto';
import { UpdateAreaPointerDto } from './dto/update-area-pointer.dto';
export declare class AreaPointersController {
    private readonly inspectionsService;
    constructor(inspectionsService: InspectionsService);
    create(inspectionId: string, dto: CreateAreaPointerDto, user: any): Promise<{
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
    }>;
    update(inspectionId: string, pointerId: string, dto: UpdateAreaPointerDto, user: any): Promise<{
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
    }>;
    remove(inspectionId: string, pointerId: string, user: any): Promise<{
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
    }>;
}
