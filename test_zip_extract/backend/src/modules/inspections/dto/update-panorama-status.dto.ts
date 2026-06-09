import { IsEnum } from 'class-validator';
import { ProcessingStatus } from '@prisma/client';

export class UpdatePanoramaStatusDto {
  @IsEnum(ProcessingStatus)
  status: ProcessingStatus;
}
