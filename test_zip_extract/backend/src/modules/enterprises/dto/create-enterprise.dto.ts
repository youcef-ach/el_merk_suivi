import { IsString, IsNotEmpty } from 'class-validator';

export class CreateEnterpriseDto {
  @IsString()
  @IsNotEmpty()
  name: string;
}
