import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { RegisterEnterpriseDto } from './dto/register-enterprise.dto';
import { LoginDto } from './dto/login.dto';
export declare class AuthController {
    private readonly authService;
    constructor(authService: AuthService);
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
}
