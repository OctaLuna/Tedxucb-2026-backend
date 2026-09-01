import { IsString, MinLength } from 'class-validator';

export class RejectRegistrationDto {
  @IsString()
  @MinLength(1)
  reason!: string;
}
