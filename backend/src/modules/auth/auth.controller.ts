import { Controller, Post, Body } from '@nestjs/common';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { RegisterEnterpriseDto } from './dto/register-enterprise.dto';
import { LoginDto } from './dto/login.dto';
import { IsPublic } from '../../decorators/public.decorator';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /**
   * Public endpoint: Register a new enterprise + its founding admin.
   */
  @IsPublic()
  @Post('register-enterprise')
  registerEnterprise(@Body() dto: RegisterEnterpriseDto) {
    return this.authService.registerEnterprise(dto);
  }

  /**
   * Kept for internal/programmatic usage (e.g. seeding).
   */
  @IsPublic()
  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @IsPublic()
  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }
}
