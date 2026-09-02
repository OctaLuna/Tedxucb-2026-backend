import { IsString, MinLength } from 'class-validator';

export class CreateFacultyDto {
  @IsString()
  @MinLength(1)
  name!: string;
}
