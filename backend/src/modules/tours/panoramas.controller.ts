import { Controller, Patch, Param, Body, UseGuards } from '@nestjs/common';
import { ToursService } from './tours.service';
import { UpdatePanoramaStatusDto } from './dto/update-panorama-status.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { GetUser } from '../../decorators/get-user.decorator';
import { Roles } from '../../decorators/roles.decorator';
import { Role } from '@prisma/client';

@Controller('panoramas')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PanoramasController {
  constructor(private readonly toursService: ToursService) {}

  @Patch(':id/status')
  @Roles(Role.ADMIN)
  updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdatePanoramaStatusDto,
    @GetUser() user: any,
  ) {
    return this.toursService.updatePanoramaStatus(id, dto, user.role);
  }
}
