import { IsString, MinLength } from 'class-validator';

export class CreateConsentVersionDto {
  @IsString()
  @MinLength(1)
  version!: string;

  @IsString()
  @MinLength(1)
  body!: string;
}
