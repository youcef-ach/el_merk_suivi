import { PrismaService } from '../prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { RegisterDto } from './dto/register.dto';
import { RegisterEnterpriseDto } from './dto/register-enterprise.dto';
import { LoginDto } from './dto/login.dto';
export declare class AuthService {
    private prisma;
    private jwtService;
    constructor(prisma: PrismaService, jwtService: JwtService);
    registerEnterprise(dto: RegisterEnterpriseDto): Promise<{
        access_token: string;
        user: {
            id: any;
            email: any;
            role: any;
            enterpriseId: any;
            enterpriseName: string;
        };
    }>;
    register(dto: RegisterDto): Promise<{
        access_token: string;
        user: {
            id: any;
            email: any;
            role: any;
            enterpriseId: any;
            enterpriseName: string;
        };
    }>;
    login(dto: LoginDto): Promise<{
        access_token: string;
        user: {
            id: any;
            email: any;
            role: any;
            enterpriseId: any;
            enterpriseName: string;
        };
    }>;
    private generateToken;
}
