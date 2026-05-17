import { IsNotEmpty } from 'class-validator';

export class ProcessScansDto {
  @IsNotEmpty()
  mpData: any;

  @IsNotEmpty()
  rcData: any;
}
