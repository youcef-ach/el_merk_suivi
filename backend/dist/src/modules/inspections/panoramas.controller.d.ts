import { InspectionsService } from './inspections.service';
import { UpdatePanoramaStatusDto } from './dto/update-panorama-status.dto';
export declare class PanoramasController {
    private readonly inspectionsService;
    constructor(inspectionsService: InspectionsService);
    updateStatus(id: string, dto: UpdatePanoramaStatusDto, user: any): Promise<{
        id: string;
        inspectionId: string;
        imageUrl: string;
        status: import(".prisma/client").$Enums.ProcessingStatus;
    }>;
}
