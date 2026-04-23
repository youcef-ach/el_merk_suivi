import { IsString, IsNumber, IsOptional } from 'class-validator';

export class CreateTagDto {
  @IsString()
  title: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsNumber()
  posX: number;

  @IsNumber()
  posY: number;

  @IsNumber()
  posZ: number;

  @IsString()
  @IsOptional()
  icon?: string;

  @IsString()
  @IsOptional()
  color?: string;

  @IsNumber()
  @IsOptional()
  size?: number;
}
