import { IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';

export class CreateCrossSectionDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsNotEmpty()
  startPoint: any; // { x, y, z }

  @IsNotEmpty()
  endPoint: any; // { x, y, z }

  @IsNotEmpty()
  sampleData: any; // Array of points

  @IsNumber()
  length: number;

  @IsNumber()
  minElev: number;

  @IsNumber()
  maxElev: number;

  @IsNumber()
  slope: number;
}
