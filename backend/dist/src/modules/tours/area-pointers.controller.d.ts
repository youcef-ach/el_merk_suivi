import { ToursService } from './tours.service';
import { CreateAreaPointerDto } from './dto/create-area-pointer.dto';
import { UpdateAreaPointerDto } from './dto/update-area-pointer.dto';
export declare class AreaPointersController {
    private readonly toursService;
    constructor(toursService: ToursService);
    create(tourId: string, dto: CreateAreaPointerDto, user: any): Promise<{
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
    update(tourId: string, pointerId: string, dto: UpdateAreaPointerDto, user: any): Promise<{
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
    remove(tourId: string, pointerId: string, user: any): Promise<{
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
