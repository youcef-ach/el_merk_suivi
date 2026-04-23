import { InspectionsService } from './inspections.service';
import { CreateTagDto } from './dto/create-tag.dto';
import { UpdateTagDto } from './dto/update-tag.dto';
import { CreateTagDocumentDto } from './dto/create-tag-document.dto';
export declare class TagsController {
    private readonly inspectionsService;
    constructor(inspectionsService: InspectionsService);
    create(inspectionId: string, dto: CreateTagDto, user: any): Promise<{
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
    }>;
    update(inspectionId: string, tagId: string, dto: UpdateTagDto, user: any): Promise<{
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
    }>;
    remove(inspectionId: string, tagId: string, user: any): Promise<{
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
    }>;
    addDocument(inspectionId: string, tagId: string, dto: CreateTagDocumentDto, user: any): Promise<{
        presignedUrl: string;
        document: {
            id: string;
            title: string;
            fileUrl: string;
            tagId: string;
        };
    }>;
    removeDocument(inspectionId: string, tagId: string, docId: string, user: any): Promise<{
        id: string;
        title: string;
        fileUrl: string;
        tagId: string;
    }>;
}
