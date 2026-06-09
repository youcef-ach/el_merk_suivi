import { IsEmail, IsNotEmpty, IsString, MinLength } from 'class-validator';

export class RegisterEnterpriseDto {
  @IsString()
  @IsNotEmpty({ message: 'Enterprise name is required' })
  enterpriseName: string;

  @IsEmail({}, { message: 'Please provide a valid email' })
  email: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(6, { message: 'Password must be at least 6 characters long' })
  password: string;
}
