import { IsString, MinLength } from 'class-validator';

export class UpdateFacultyDto {
  @IsString()
  @MinLength(1)
  name!: string;
}
