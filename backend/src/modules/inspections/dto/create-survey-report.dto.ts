import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { ReportType } from '@prisma/client';

export class CreateSurveyReportDto {
  @IsEnum(ReportType)
  @IsOptional()
  reportType?: ReportType;

  @IsString()
  @IsNotEmpty()
  title: string;

  @IsOptional()
  summary?: any;

  @IsString()
  @IsNotEmpty()
  fileUrl: string;
}
