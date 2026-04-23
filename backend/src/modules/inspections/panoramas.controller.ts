import { Controller, Patch, Param, Body, UseGuards } from '@nestjs/common';
import { InspectionsService } from './inspections.service';
import { UpdatePanoramaStatusDto } from './dto/update-panorama-status.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { GetUser } from '../../decorators/get-user.decorator';
import { Roles } from '../../decorators/roles.decorator';
import { Role } from '@prisma/client';

@Controller('panoramas')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PanoramasController {
  constructor(private readonly inspectionsService: InspectionsService) {}

  @Patch(':id/status')
  @Roles(Role.ADMIN)
  updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdatePanoramaStatusDto,
    @GetUser() user: any,
  ) {
    return this.inspectionsService.updatePanoramaStatus(id, dto, user.role);
  }
}
