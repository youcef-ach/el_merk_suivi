import { IsEnum, IsOptional, IsString } from 'class-validator';
import { Visibility } from '@prisma/client';

export class CreateTourDto {
  @IsString()
  title: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsEnum(Visibility)
  @IsOptional()
  visibility?: Visibility;
}
