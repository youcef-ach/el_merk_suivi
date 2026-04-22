import { IsString, IsNumber, IsOptional } from 'class-validator';

export class CreateAreaPointerDto {
  @IsString()
  name: string;

  @IsString()
  @IsOptional()
  color?: string;

  @IsNumber()
  posX: number;

  @IsNumber()
  posY: number;

  @IsNumber()
  posZ: number;

  @IsNumber()
  @IsOptional()
  height?: number;

  @IsNumber()
  @IsOptional()
  thickness?: number;

  @IsNumber()
  @IsOptional()
  labelSize?: number;
}
