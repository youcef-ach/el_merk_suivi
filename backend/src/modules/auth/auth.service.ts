import { Injectable, UnauthorizedException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { RegisterDto } from './dto/register.dto';
import { RegisterEnterpriseDto } from './dto/register-enterprise.dto';
import { LoginDto } from './dto/login.dto';
import { Role } from '@prisma/client';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
  ) {}

  /**
   * Register a brand-new enterprise together with its founding admin account.
   * This is the entry-point for new organisations.
   */
  async registerEnterprise(dto: RegisterEnterpriseDto) {
    const existingUser = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existingUser) {
      throw new ConflictException('Email already in use');
    }

    const hashedPassword = await bcrypt.hash(dto.password, 10);

    // Wrap in a transaction so both Enterprise and User are created atomically
    const { enterprise, user } = await this.prisma.$transaction(async (tx) => {
      const enterprise = await tx.enterprise.create({
        data: { name: dto.enterpriseName },
      });

      const user = await tx.user.create({
        data: {
          email: dto.email,
          password: hashedPassword,
          role: Role.ADMIN,
          enterpriseId: enterprise.id,
        },
      });

      return { enterprise, user };
    });

    return this.generateToken(user, enterprise.name);
  }

  /**
   * Legacy / simple register — used when an admin adds a member via the member 
   * management panel (not the public auth page).
   */
  async register(dto: RegisterDto) {
    const existingUser = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existingUser) {
      throw new ConflictException('Email already in use');
    }

    const hashedPassword = await bcrypt.hash(dto.password, 10);
    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        password: hashedPassword,
        enterpriseId: dto.enterpriseId,
      },
    });

    return this.generateToken(user);
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
      include: { enterprise: true },
    });
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const isMatch = await bcrypt.compare(dto.password, user.password);
    if (!isMatch) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return this.generateToken(user, user.enterprise?.name);
  }

  private generateToken(user: any, enterpriseName?: string) {
    const payload = { email: user.email, sub: user.id, role: user.role, enterpriseId: user.enterpriseId };
    return {
      access_token: this.jwtService.sign(payload),
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        enterpriseId: user.enterpriseId,
        enterpriseName: enterpriseName || null,
      }
    };
  }
}
