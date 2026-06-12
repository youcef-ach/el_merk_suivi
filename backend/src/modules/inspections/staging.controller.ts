import { Controller, Get, Post, Body, Param, Put, Delete, UseGuards, Request } from '@nestjs/common';
import { InspectionsService } from './inspections.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Role } from '@prisma/client';

@Controller('inspections')
@UseGuards(JwtAuthGuard)
export class StagingController {
  constructor(private readonly inspectionsService: InspectionsService) {}

  @Post(':id/staging-profiles')
  createProfile(@Param('id') inspectionId: string, @Body() body: { name: string }, @Request() req) {
    const { enterpriseId, role } = req.user;
    return this.inspectionsService.createStagingProfile(inspectionId, body.name, enterpriseId, role as Role);
  }

  @Get(':id/staging-profiles/:profileId')
  getProfile(@Param('id') inspectionId: string, @Param('profileId') profileId: string) {
    return this.inspectionsService.getStagingProfile(inspectionId, profileId);
  }

  @Post(':id/staging-profiles/:profileId/items')
  saveItems(
    @Param('id') inspectionId: string,
    @Param('profileId') profileId: string,
    @Body() body: { items: any[] },
    @Request() req
  ) {
    const { enterpriseId, role } = req.user;
    return this.inspectionsService.saveStagedItems(inspectionId, profileId, body.items || [], enterpriseId, role as Role);
  }

  @Post(':id/staging-profiles/:profileId/baked-panoramas')
  saveBakedPanoramas(
    @Param('id') inspectionId: string,
    @Param('profileId') profileId: string,
    @Body() body: { panoramas: any[] },
    @Request() req
  ) {
    const { enterpriseId, role } = req.user;
    return this.inspectionsService.saveBakedPanoramas(inspectionId, profileId, body.panoramas || [], enterpriseId, role as Role);
  }
}
