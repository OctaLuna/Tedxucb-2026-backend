import { IsOptional, IsString, IsUUID, MinLength } from 'class-validator';

export class UpdateCareerDto {
  @IsOptional()
  @IsUUID()
  facultyId?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;
}
