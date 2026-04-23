import { IsString, IsNotEmpty } from 'class-validator';

export class CreatePanoramaDto {
  @IsString()
  @IsNotEmpty()
  imageUrl: string;
}
