import { Controller, Post, Patch, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { ToursService } from './tours.service';
import { CreateAreaPointerDto } from './dto/create-area-pointer.dto';
import { UpdateAreaPointerDto } from './dto/update-area-pointer.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { GetUser } from '../../decorators/get-user.decorator';

@Controller('tours/:tourId/area-pointers')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AreaPointersController {
  constructor(private readonly toursService: ToursService) {}

  @Post()
  create(
    @Param('tourId') tourId: string,
    @Body() dto: CreateAreaPointerDto,
    @GetUser() user: any,
  ) {
    return this.toursService.createAreaPointer(tourId, dto, user.id, user.role);
  }

  @Patch(':pointerId')
  update(
    @Param('tourId') tourId: string,
    @Param('pointerId') pointerId: string,
    @Body() dto: UpdateAreaPointerDto,
    @GetUser() user: any,
  ) {
    return this.toursService.updateAreaPointer(tourId, pointerId, dto, user.id, user.role);
  }

  @Delete(':pointerId')
  remove(
    @Param('tourId') tourId: string,
    @Param('pointerId') pointerId: string,
    @GetUser() user: any,
  ) {
    return this.toursService.deleteAreaPointer(tourId, pointerId, user.id, user.role);
  }
}
