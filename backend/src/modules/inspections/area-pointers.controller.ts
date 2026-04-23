import { Controller, Post, Patch, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { InspectionsService } from './inspections.service';
import { CreateAreaPointerDto } from './dto/create-area-pointer.dto';
import { UpdateAreaPointerDto } from './dto/update-area-pointer.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { GetUser } from '../../decorators/get-user.decorator';

@Controller('inspections/:inspectionId/area-pointers')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AreaPointersController {
  constructor(private readonly inspectionsService: InspectionsService) {}

  @Post()
  create(
    @Param('inspectionId') inspectionId: string,
    @Body() dto: CreateAreaPointerDto,
    @GetUser() user: any,
  ) {
    return this.inspectionsService.createAreaPointer(inspectionId, dto, user.id, user.role);
  }

  @Patch(':pointerId')
  update(
    @Param('inspectionId') inspectionId: string,
    @Param('pointerId') pointerId: string,
    @Body() dto: UpdateAreaPointerDto,
    @GetUser() user: any,
  ) {
    return this.inspectionsService.updateAreaPointer(inspectionId, pointerId, dto, user.id, user.role);
  }

  @Delete(':pointerId')
  remove(
    @Param('inspectionId') inspectionId: string,
    @Param('pointerId') pointerId: string,
    @GetUser() user: any,
  ) {
    return this.inspectionsService.deleteAreaPointer(inspectionId, pointerId, user.id, user.role);
  }
}
