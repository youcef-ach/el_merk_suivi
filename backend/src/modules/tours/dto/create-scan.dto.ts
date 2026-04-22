import { IsNumber, IsOptional, IsUUID } from 'class-validator';

export class CreateScanDto {
  @IsNumber()
  posX: number;

  @IsNumber()
  posY: number;

  @IsNumber()
  posZ: number;

  @IsNumber()
  quatW: number;

  @IsNumber()
  quatX: number;

  @IsNumber()
  quatY: number;

  @IsNumber()
  quatZ: number;

  @IsUUID('4')
  @IsOptional()
  targetScanId?: string;
}
