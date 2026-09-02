import { IsOptional, IsString, Matches, MinLength } from 'class-validator';

export class CreateContentBlockDto {
  @IsString()
  @Matches(/^[a-z0-9_]+$/, { message: 'debe usar solo minúsculas, números y guión bajo' })
  key!: string;

  @IsOptional()
  @IsString()
  title?: string;

  @IsString()
  @MinLength(1)
  body!: string;
}
