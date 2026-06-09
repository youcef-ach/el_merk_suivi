import { IsArray, IsUUID } from 'class-validator';

export class UpdateInspectionPermissionsDto {
  @IsArray()
  @IsUUID('4', { each: true })
  authorizedViewerIds: string[];
}
