import { IsString, IsOptional, IsNumber } from 'class-validator';

export class UpdateAreaPointerDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  color?: string;

  @IsNumber()
  @IsOptional()
  posX?: number;

  @IsNumber()
  @IsOptional()
  posY?: number;

  @IsNumber()
  @IsOptional()
  posZ?: number;

  @IsNumber()
  @IsOptional()
  height?: number;

  @IsNumber()
  @IsOptional()
  thickness?: number;

  @IsNumber()
  @IsOptional()
  labelSize?: number;

  @IsNumber()
  @IsOptional()
  sizeX?: number;

  @IsNumber()
  @IsOptional()
  sizeY?: number;

  @IsNumber()
  @IsOptional()
  wallHeight?: number;
}
