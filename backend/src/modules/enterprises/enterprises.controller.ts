import { Controller, Get, Post, Body, Param, Delete, UseGuards } from '@nestjs/common';
import { EnterprisesService } from './enterprises.service';
import { CreateEnterpriseDto } from './dto/create-enterprise.dto';
import { AddMemberDto } from './dto/add-member.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { GetUser } from '../../decorators/get-user.decorator';
import { Roles } from '../../decorators/roles.decorator';
import { Role } from '@prisma/client';

@Controller('enterprises')
@UseGuards(JwtAuthGuard, RolesGuard)
export class EnterprisesController {
  constructor(private readonly enterprisesService: EnterprisesService) {}

  @Post()
  @Roles(Role.ADMIN)
  create(@Body() createEnterpriseDto: CreateEnterpriseDto) {
    return this.enterprisesService.create(createEnterpriseDto);
  }

  @Get()
  @Roles(Role.ADMIN)
  findAll() {
    return this.enterprisesService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.enterprisesService.findOne(id);
  }

  // ─── Member Management ────────────────────────────────────────

  @Get('members/list')
  @Roles(Role.ADMIN)
  getMembers(@GetUser() user: any) {
    return this.enterprisesService.getMembers(user.enterpriseId);
  }

  @Post('members/add')
  @Roles(Role.ADMIN)
  addMember(@Body() dto: AddMemberDto, @GetUser() user: any) {
    return this.enterprisesService.addMember(dto, user.enterpriseId);
  }

  @Delete('members/:memberId')
  @Roles(Role.ADMIN)
  removeMember(@Param('memberId') memberId: string, @GetUser() user: any) {
    return this.enterprisesService.removeMember(memberId, user.enterpriseId, user.id);
  }
}
