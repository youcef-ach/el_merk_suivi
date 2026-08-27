import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards } from '@nestjs/common';
import { InspectionsService } from './inspections.service';
import { CreateInspectionDto } from './dto/create-inspection.dto';
import { CreateScanDto } from './dto/create-scan.dto';
import { CreatePanoramaDto } from './dto/create-panorama.dto';
import { UpdateInspectionPermissionsDto } from './dto/update-inspection-permissions.dto';
import { ProcessScansDto } from './dto/process-scans.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { IsPublic } from '../../decorators/public.decorator';
import { GetUser } from '../../decorators/get-user.decorator';
import { Roles } from '../../decorators/roles.decorator';
import { Role } from '@prisma/client';

@Controller('projects/:projectId/inspections')
@UseGuards(JwtAuthGuard, RolesGuard)
export class InspectionsController {
  constructor(private readonly inspectionsService: InspectionsService) {}

  @Post()
  create(@Param('projectId') projectId: string, @Body() createInspectionDto: CreateInspectionDto, @GetUser() user: any) {
    return this.inspectionsService.create(projectId, createInspectionDto, user.id);
  }

  @IsPublic() // Bypasses unauthorized throw, but still grabs user if JWT is present
  @Get()
  findAll(@Param('projectId') projectId: string, @GetUser() user: any) {
    return this.inspectionsService.findAll(projectId, user);
  }

  @IsPublic()
  @Get(':id')
  findOne(@Param('id') id: string, @GetUser() user: any) {
    return this.inspectionsService.findOne(id, user);
  }

  @IsPublic()
  @Get(':id/bundle')
  getBundle(@Param('id') id: string, @GetUser() user: any) {
    // Highly optimized tree returned natively via Prisma relations
    return this.inspectionsService.getBundle(id, user);
  }

  @Post(':id/clone')
  clone(
    @Param('id') id: string,
    @GetUser() user: any,
  ) {
    return this.inspectionsService.clone(id, user.enterpriseId, user.role);
  }

  @Post(':id/scans')
  createScan(
    @Param('id') id: string,
    @Body() dto: CreateScanDto,
    @GetUser() user: any,
  ) {
    return this.inspectionsService.createScan(id, dto, user.enterpriseId, user.role);
  }

  @Post(':id/panoramas')
  createPanorama(
    @Param('id') id: string,
    @Body() dto: CreatePanoramaDto,
    @GetUser() user: any,
  ) {
    return this.inspectionsService.createPanorama(id, dto, user.enterpriseId, user.role);
  }

  @Patch(':id/permissions')
  @Roles(Role.ADMIN)
  setPermissions(
    @Param('id') id: string,
    @Body() dto: UpdateInspectionPermissionsDto,
    @GetUser() user: any,
  ) {
    return this.inspectionsService.setPermissions(id, dto, user.enterpriseId, user.role);
  }

  @Patch(':id')
  @Roles(Role.ADMIN)
  updateInspection(
    @Param('id') id: string,
    @Body() dto: any,
    @GetUser() user: any,
  ) {
    return this.inspectionsService.update(id, dto, user.enterpriseId, user.role);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @GetUser() user: any) {
    return this.inspectionsService.remove(id, user.enterpriseId, user.role);
  }

  @Post(':id/upload-url')
  getUploadUrl(
    @Param('id') id: string,
    @Body('fileName') fileName: string,
    @GetUser() user: any,
  ) {
    return this.inspectionsService.getUploadUrl(id, fileName, user.enterpriseId, user.role);
  }

  @Post(':id/process-scans')
  async processAndUploadScans(
    @Param('id') id: string,
    @Body() body: ProcessScansDto,
    @GetUser() user: any,
  ) {
    return this.inspectionsService.processAndUploadScans(id, body.mpData, body.rcData, user.enterpriseId, user.role);
  }

  @Post(':id/process-glb')
  async processGlb(
    @Param('id') id: string,
    @GetUser() user: any,
  ) {
    return this.inspectionsService.processGlb(id, user.enterpriseId, user.role);
  }

  @Post(':id/process-tileset')
  async processTileset(
    @Param('id') id: string,
    @GetUser() user: any,
  ) {
    return this.inspectionsService.processTileset(id, user.enterpriseId, user.role);
  }
}

