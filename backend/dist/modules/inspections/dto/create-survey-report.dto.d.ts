import { ReportType } from '@prisma/client';
export declare class CreateSurveyReportDto {
    reportType?: ReportType;
    title: string;
    summary?: any;
    fileUrl: string;
}
