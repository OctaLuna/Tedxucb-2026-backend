import { IsIn, IsString, MinLength } from 'class-validator';

export class CreateCorrectionRequestDto {
  @IsIn(['studentCode', 'careerId', 'email'])
  field!: 'studentCode' | 'careerId' | 'email';

  @IsString()
  @MinLength(1)
  newValue!: string;

  @IsString()
  @MinLength(1)
  reason!: string;
}
