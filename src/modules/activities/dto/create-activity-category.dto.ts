import { IsInt, IsOptional, IsString, Min, MinLength } from 'class-validator';

export class CreateActivityCategoryDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsOptional()
  @IsString()
  color?: string;

  /** RF-310a: valor sugerido para actividades nuevas de esta categoría. */
  @IsOptional()
  @IsInt()
  @Min(1)
  suggestedPoints?: number;
}
