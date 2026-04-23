import { Visibility } from '@prisma/client';
export declare class CreateInspectionDto {
    title: string;
    description?: string;
    visibility?: Visibility;
}
