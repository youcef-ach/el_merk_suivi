import { InspectionsService } from './inspections.service';
import { UpdateSurveyMetaDto } from './dto/survey-meta.dto';
import { CreateSurveyReportDto } from './dto/create-survey-report.dto';
import { CreateCrossSectionDto } from './dto/create-cross-section.dto';
import { CreateSiteMeasurementDto } from './dto/create-site-measurement.dto';
export declare class SurveyDataController {
    private readonly inspectionsService;
    constructor(inspectionsService: InspectionsService);
    updateMeta(inspectionId: string, dto: UpdateSurveyMetaDto, user: any): Promise<{
        surveyReports: {
            id: string;
            title: string;
            createdAt: Date;
            inspectionId: string;
            fileUrl: string;
            reportType: import(".prisma/client").$Enums.ReportType;
            summary: import("@prisma/client/runtime/library").JsonValue | null;
        }[];
        crossSections: {
            id: string;
            createdAt: Date;
            name: string;
            inspectionId: string;
            startPoint: import("@prisma/client/runtime/library").JsonValue;
            endPoint: import("@prisma/client/runtime/library").JsonValue;
            sampleData: import("@prisma/client/runtime/library").JsonValue;
            length: number;
            minElev: number;
            maxElev: number;
            slope: number;
        }[];
        siteMeasurements: {
            id: string;
            type: string;
            createdAt: Date;
            inspectionId: string;
            points: import("@prisma/client/runtime/library").JsonValue;
            values: import("@prisma/client/runtime/library").JsonValue;
            label: string | null;
        }[];
    } & {
        id: string;
        type: import(".prisma/client").$Enums.InspectionType;
        title: string;
        description: string | null;
        glbModelUrl: string | null;
        scansJsonUrl: string | null;
        rawScansJsonUrl: string | null;
        rawCsvJsonUrl: string | null;
        thumbnailUrl: string | null;
        videoUrl: string | null;
        visibility: import(".prisma/client").$Enums.Visibility;
        processingStatus: string;
        processingProgress: number;
        processingStage: string;
        processingError: string | null;
        surveyDate: Date | null;
        droneModel: string | null;
        gsd: number | null;
        flightAltitude: number | null;
        coordinateSystem: string | null;
        tilesetUrl: string | null;
        orthoUrl: string | null;
        orthoBounds: import("@prisma/client/runtime/library").JsonValue | null;
        dsmUrl: string | null;
        dtmUrl: string | null;
        dsmMinElevation: number | null;
        dsmMaxElevation: number | null;
        contoursUrl: string | null;
        createdAt: Date;
        updatedAt: Date;
        projectId: string;
    }>;
    addReport(inspectionId: string, dto: CreateSurveyReportDto, user: any): Promise<{
        id: string;
        title: string;
        createdAt: Date;
        inspectionId: string;
        fileUrl: string;
        reportType: import(".prisma/client").$Enums.ReportType;
        summary: import("@prisma/client/runtime/library").JsonValue | null;
    }>;
    getReports(inspectionId: string, user: any): Promise<{
        id: string;
        title: string;
        createdAt: Date;
        inspectionId: string;
        fileUrl: string;
        reportType: import(".prisma/client").$Enums.ReportType;
        summary: import("@prisma/client/runtime/library").JsonValue | null;
    }[]>;
    deleteReport(inspectionId: string, reportId: string, user: any): Promise<{
        id: string;
        title: string;
        createdAt: Date;
        inspectionId: string;
        fileUrl: string;
        reportType: import(".prisma/client").$Enums.ReportType;
        summary: import("@prisma/client/runtime/library").JsonValue | null;
    }>;
    addCrossSection(inspectionId: string, dto: CreateCrossSectionDto, user: any): Promise<{
        id: string;
        createdAt: Date;
        name: string;
        inspectionId: string;
        startPoint: import("@prisma/client/runtime/library").JsonValue;
        endPoint: import("@prisma/client/runtime/library").JsonValue;
        sampleData: import("@prisma/client/runtime/library").JsonValue;
        length: number;
        minElev: number;
        maxElev: number;
        slope: number;
    }>;
    getCrossSections(inspectionId: string, user: any): Promise<{
        id: string;
        createdAt: Date;
        name: string;
        inspectionId: string;
        startPoint: import("@prisma/client/runtime/library").JsonValue;
        endPoint: import("@prisma/client/runtime/library").JsonValue;
        sampleData: import("@prisma/client/runtime/library").JsonValue;
        length: number;
        minElev: number;
        maxElev: number;
        slope: number;
    }[]>;
    deleteCrossSection(inspectionId: string, sectionId: string, user: any): Promise<{
        id: string;
        createdAt: Date;
        name: string;
        inspectionId: string;
        startPoint: import("@prisma/client/runtime/library").JsonValue;
        endPoint: import("@prisma/client/runtime/library").JsonValue;
        sampleData: import("@prisma/client/runtime/library").JsonValue;
        length: number;
        minElev: number;
        maxElev: number;
        slope: number;
    }>;
    addMeasurement(inspectionId: string, dto: CreateSiteMeasurementDto, user: any): Promise<{
        id: string;
        type: string;
        createdAt: Date;
        inspectionId: string;
        points: import("@prisma/client/runtime/library").JsonValue;
        values: import("@prisma/client/runtime/library").JsonValue;
        label: string | null;
    }>;
    getMeasurements(inspectionId: string, user: any): Promise<{
        id: string;
        type: string;
        createdAt: Date;
        inspectionId: string;
        points: import("@prisma/client/runtime/library").JsonValue;
        values: import("@prisma/client/runtime/library").JsonValue;
        label: string | null;
    }[]>;
    deleteMeasurement(inspectionId: string, measurementId: string, user: any): Promise<{
        id: string;
        type: string;
        createdAt: Date;
        inspectionId: string;
        points: import("@prisma/client/runtime/library").JsonValue;
        values: import("@prisma/client/runtime/library").JsonValue;
        label: string | null;
    }>;
}
