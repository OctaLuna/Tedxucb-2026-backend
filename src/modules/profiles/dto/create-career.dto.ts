import { IsString, IsUUID, MinLength } from 'class-validator';

export class CreateCareerDto {
  @IsUUID()
  facultyId!: string;

  @IsString()
  @MinLength(1)
  name!: string;
}
