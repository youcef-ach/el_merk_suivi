import { IsEnum, IsOptional, IsString } from 'class-validator';
import { Visibility } from '@prisma/client';

export class CreateInspectionDto {
  @IsString()
  title: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsEnum(Visibility)
  @IsOptional()
  visibility?: Visibility;
}
