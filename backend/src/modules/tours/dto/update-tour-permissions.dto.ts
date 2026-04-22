import { IsArray, IsUUID } from 'class-validator';

export class UpdateTourPermissionsDto {
  @IsArray()
  @IsUUID('4', { each: true })
  authorizedViewerIds: string[];
}
