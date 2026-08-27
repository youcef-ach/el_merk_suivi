import { Controller, Post, Get, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { InspectionsService } from './inspections.service';
import { UpdateSurveyMetaDto } from './dto/survey-meta.dto';
import { CreateSurveyReportDto } from './dto/create-survey-report.dto';
import { CreateCrossSectionDto } from './dto/create-cross-section.dto';
import { CreateSiteMeasurementDto } from './dto/create-site-measurement.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { GetUser } from '../../decorators/get-user.decorator';

@Controller('inspections/:inspectionId/survey')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SurveyDataController {
  constructor(private readonly inspectionsService: InspectionsService) {}

  // Update Survey Metadata (Tileset URL, Ortho, DSM/DTM, GSD, Contours)
  @Post('meta')
  updateMeta(
    @Param('inspectionId') inspectionId: string,
    @Body() dto: UpdateSurveyMetaDto,
    @GetUser() user: any,
  ) {
    return this.inspectionsService.updateSurveyMeta(inspectionId, dto, user.id, user.role);
  }

  // Reports
  @Post('reports')
  addReport(
    @Param('inspectionId') inspectionId: string,
    @Body() dto: CreateSurveyReportDto,
    @GetUser() user: any,
  ) {
    return this.inspectionsService.createSurveyReport(inspectionId, dto, user.id, user.role);
  }

  @Get('reports')
  getReports(
    @Param('inspectionId') inspectionId: string,
    @GetUser() user: any,
  ) {
    return this.inspectionsService.getSurveyReports(inspectionId, user.id, user.role);
  }

  @Delete('reports/:reportId')
  deleteReport(
    @Param('inspectionId') inspectionId: string,
    @Param('reportId') reportId: string,
    @GetUser() user: any,
  ) {
    return this.inspectionsService.deleteSurveyReport(inspectionId, reportId, user.id, user.role);
  }

  // Cross Sections
  @Post('cross-sections')
  addCrossSection(
    @Param('inspectionId') inspectionId: string,
    @Body() dto: CreateCrossSectionDto,
    @GetUser() user: any,
  ) {
    return this.inspectionsService.createCrossSection(inspectionId, dto, user.id, user.role);
  }

  @Get('cross-sections')
  getCrossSections(
    @Param('inspectionId') inspectionId: string,
    @GetUser() user: any,
  ) {
    return this.inspectionsService.getCrossSections(inspectionId, user.id, user.role);
  }

  @Delete('cross-sections/:sectionId')
  deleteCrossSection(
    @Param('inspectionId') inspectionId: string,
    @Param('sectionId') sectionId: string,
    @GetUser() user: any,
  ) {
    return this.inspectionsService.deleteCrossSection(inspectionId, sectionId, user.id, user.role);
  }

  // Site Measurements
  @Post('measurements')
  addMeasurement(
    @Param('inspectionId') inspectionId: string,
    @Body() dto: CreateSiteMeasurementDto,
    @GetUser() user: any,
  ) {
    return this.inspectionsService.createSiteMeasurement(inspectionId, dto, user.id, user.role);
  }

  @Get('measurements')
  getMeasurements(
    @Param('inspectionId') inspectionId: string,
    @GetUser() user: any,
  ) {
    return this.inspectionsService.getSiteMeasurements(inspectionId, user.id, user.role);
  }

  @Delete('measurements/:measurementId')
  deleteMeasurement(
    @Param('inspectionId') inspectionId: string,
    @Param('measurementId') measurementId: string,
    @GetUser() user: any,
  ) {
    return this.inspectionsService.deleteSiteMeasurement(inspectionId, measurementId, user.id, user.role);
  }
}
