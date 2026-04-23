import { IsString } from 'class-validator';

export class CreateTagDocumentDto {
  @IsString()
  title: string;

  @IsString()
  fileName: string;
}
