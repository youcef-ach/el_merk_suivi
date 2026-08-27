import { IsOptional, IsString, IsNumber, IsDateString } from 'class-validator';

export class UpdateSurveyMetaDto {
  @IsOptional()
  @IsDateString()
  surveyDate?: string;

  @IsOptional()
  @IsString()
  droneModel?: string;

  @IsOptional()
  @IsNumber()
  gsd?: number;

  @IsOptional()
  @IsNumber()
  flightAltitude?: number;

  @IsOptional()
  @IsString()
  coordinateSystem?: string;

  @IsOptional()
  @IsString()
  tilesetUrl?: string;

  @IsOptional()
  @IsString()
  orthoUrl?: string;

  @IsOptional()
  orthoBounds?: any;

  @IsOptional()
  @IsString()
  dsmUrl?: string;

  @IsOptional()
  @IsString()
  dtmUrl?: string;

  @IsOptional()
  @IsNumber()
  dsmMinElevation?: number;

  @IsOptional()
  @IsNumber()
  dsmMaxElevation?: number;

  @IsOptional()
  @IsString()
  contoursUrl?: string;
}
