import { IsInt, IsOptional, IsString, Min, MinLength } from 'class-validator';

export class UpdateActivityCategoryDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsString()
  color?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  suggestedPoints?: number;
}
