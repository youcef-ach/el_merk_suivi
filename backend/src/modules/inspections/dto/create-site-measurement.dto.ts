import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateSiteMeasurementDto {
  @IsString()
  @IsNotEmpty()
  type: string; // DISTANCE_3D, DISTANCE_2D, HEIGHT_DIFF, AREA, VOLUME

  @IsNotEmpty()
  points: any;

  @IsNotEmpty()
  values: any;

  @IsOptional()
  @IsString()
  label?: string;
}
