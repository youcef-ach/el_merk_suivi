import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { InspectionsService } from './inspections.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { IsPublic } from '../../decorators/public.decorator';
import { GetUser } from '../../decorators/get-user.decorator';

/**
 * Direct-access controller for inspections — used by the 3D Engine and Studio
 * which only know the inspection ID, not the parent project ID.
 */
@Controller('inspections')
@UseGuards(JwtAuthGuard, RolesGuard)
export class InspectionsDirectController {
  constructor(private readonly inspectionsService: InspectionsService) {}

  @IsPublic()
  @Get(':id')
  findOne(@Param('id') id: string, @GetUser() user: any) {
    return this.inspectionsService.findOne(id, user);
  }

  @IsPublic()
  @Get(':id/bundle')
  getBundle(@Param('id') id: string, @GetUser() user: any) {
    return this.inspectionsService.getBundle(id, user);
  }
}
