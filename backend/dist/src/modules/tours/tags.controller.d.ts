import { ToursService } from './tours.service';
import { CreateTagDto } from './dto/create-tag.dto';
import { UpdateTagDto } from './dto/update-tag.dto';
import { CreateTagDocumentDto } from './dto/create-tag-document.dto';
export declare class TagsController {
    private readonly toursService;
    constructor(toursService: ToursService);
    create(tourId: string, dto: CreateTagDto, user: any): Promise<{
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
        tourId: string;
        title: string;
        description: string | null;
        icon: string;
        size: number;
    }>;
    update(tourId: string, tagId: string, dto: UpdateTagDto, user: any): Promise<{
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
        tourId: string;
        title: string;
        description: string | null;
        icon: string;
        size: number;
    }>;
    remove(tourId: string, tagId: string, user: any): Promise<{
        id: string;
        color: string;
        posX: number;
        posY: number;
        posZ: number;
        tourId: string;
        title: string;
        description: string | null;
        icon: string;
        size: number;
    }>;
    addDocument(tourId: string, tagId: string, dto: CreateTagDocumentDto, user: any): Promise<{
        presignedUrl: string;
        document: {
            id: string;
            title: string;
            fileUrl: string;
            tagId: string;
        };
    }>;
    removeDocument(tourId: string, tagId: string, docId: string, user: any): Promise<{
        id: string;
        title: string;
        fileUrl: string;
        tagId: string;
    }>;
}
