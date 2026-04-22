import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards } from '@nestjs/common';
import { ToursService } from './tours.service';
import { CreateTourDto } from './dto/create-tour.dto';
import { CreateScanDto } from './dto/create-scan.dto';
import { CreatePanoramaDto } from './dto/create-panorama.dto';
import { UpdateTourPermissionsDto } from './dto/update-tour-permissions.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { IsPublic } from '../../decorators/public.decorator';
import { GetUser } from '../../decorators/get-user.decorator';
import { Roles } from '../../decorators/roles.decorator';
import { Role } from '@prisma/client';

@Controller('tours')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ToursController {
  constructor(private readonly toursService: ToursService) {}

  @Post()
  create(@Body() createTourDto: CreateTourDto, @GetUser() user: any) {
    return this.toursService.create(createTourDto, user.id);
  }

  @IsPublic() // Bypasses unauthorized throw, but still grabs user if JWT is present
  @Get()
  findAll(@GetUser() user: any) {
    return this.toursService.findAll(user);
  }

  @IsPublic()
  @Get(':id')
  findOne(@Param('id') id: string, @GetUser() user: any) {
    return this.toursService.findOne(id, user);
  }

  @IsPublic()
  @Get(':id/bundle')
  getBundle(@Param('id') id: string, @GetUser() user: any) {
    // Highly optimized tree returned natively via Prisma relations
    return this.toursService.getBundle(id, user);
  }

  @Post(':id/scans')
  createScan(
    @Param('id') id: string,
    @Body() dto: CreateScanDto,
    @GetUser() user: any,
  ) {
    return this.toursService.createScan(id, dto, user.id, user.role);
  }

  @Post(':id/panoramas')
  createPanorama(
    @Param('id') id: string,
    @Body() dto: CreatePanoramaDto,
    @GetUser() user: any,
  ) {
    return this.toursService.createPanorama(id, dto, user.id, user.role);
  }

  @Patch(':id/permissions')
  @Roles(Role.ADMIN)
  setPermissions(
    @Param('id') id: string,
    @Body() dto: UpdateTourPermissionsDto,
    @GetUser() user: any,
  ) {
    return this.toursService.setPermissions(id, dto, user.id, user.role);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @GetUser() user: any) {
    return this.toursService.remove(id, user.id, user.role);
  }

  @Post(':id/upload-url')
  getUploadUrl(
    @Param('id') id: string,
    @Body('fileName') fileName: string,
    @GetUser() user: any,
  ) {
    return this.toursService.getUploadUrl(id, fileName, user.id, user.role);
  }
}
