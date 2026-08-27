import { Visibility } from '@prisma/client';
export declare class CreateInspectionDto {
    title: string;
    description?: string;
    visibility?: Visibility;
    surveyDate?: string;
    droneModel?: string;
    gsd?: number;
    flightAltitude?: number;
    coordinateSystem?: string;
    tilesetUrl?: string;
    orthoUrl?: string;
    orthoBounds?: any;
    dsmUrl?: string;
    dtmUrl?: string;
    contoursUrl?: string;
}
