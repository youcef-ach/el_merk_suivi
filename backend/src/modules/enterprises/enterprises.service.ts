import { Injectable, NotFoundException, ConflictException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateEnterpriseDto } from './dto/create-enterprise.dto';
import { AddMemberDto } from './dto/add-member.dto';
import * as bcrypt from 'bcryptjs';

@Injectable()
export class EnterprisesService {
  constructor(private prisma: PrismaService) {}

  async create(createEnterpriseDto: CreateEnterpriseDto) {
    return this.prisma.enterprise.create({
      data: createEnterpriseDto,
    });
  }

  async findAll() {
    return this.prisma.enterprise.findMany();
  }

  async findOne(id: string) {
    const enterprise = await this.prisma.enterprise.findUnique({
      where: { id },
    });
    if (!enterprise) throw new NotFoundException('Enterprise not found');
    return enterprise;
  }

  /**
   * Add a new member (ADMIN or VIEWER) to the caller's enterprise.
   */
  async addMember(dto: AddMemberDto, callerEnterpriseId: string) {
    if (!callerEnterpriseId) {
      throw new ForbiddenException('You are not assigned to an enterprise');
    }

    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) {
      throw new ConflictException('A user with this email already exists');
    }

    const hashedPassword = await bcrypt.hash(dto.password, 10);

    return this.prisma.user.create({
      data: {
        email: dto.email,
        password: hashedPassword,
        role: dto.role,
        enterpriseId: callerEnterpriseId,
      },
      select: {
        id: true,
        email: true,
        role: true,
        createdAt: true,
      },
    });
  }

  /**
   * List all members belonging to the given enterprise.
   */
  async getMembers(enterpriseId: string) {
    if (!enterpriseId) {
      throw new ForbiddenException('You are not assigned to an enterprise');
    }

    return this.prisma.user.findMany({
      where: { enterpriseId },
      select: {
        id: true,
        email: true,
        role: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  /**
   * Remove a member from the enterprise.
   */
  async removeMember(memberId: string, callerEnterpriseId: string, callerId: string) {
    if (memberId === callerId) {
      throw new ForbiddenException('You cannot remove yourself');
    }

    const member = await this.prisma.user.findUnique({ where: { id: memberId } });
    if (!member) throw new NotFoundException('User not found');
    if (member.enterpriseId !== callerEnterpriseId) {
      throw new ForbiddenException('This user does not belong to your enterprise');
    }

    return this.prisma.user.delete({ where: { id: memberId } });
  }
}
