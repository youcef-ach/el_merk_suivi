import { Visibility } from '@prisma/client';
export declare class CreateTourDto {
    title: string;
    description?: string;
    visibility?: Visibility;
}
