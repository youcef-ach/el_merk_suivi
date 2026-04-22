import { ToursService } from './tours.service';
import { UpdatePanoramaStatusDto } from './dto/update-panorama-status.dto';
export declare class PanoramasController {
    private readonly toursService;
    constructor(toursService: ToursService);
    updateStatus(id: string, dto: UpdatePanoramaStatusDto, user: any): Promise<{
        id: string;
        tourId: string;
        imageUrl: string;
        status: import(".prisma/client").$Enums.ProcessingStatus;
    }>;
}
