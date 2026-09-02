import { IsOptional, IsString, MinLength } from 'class-validator';

/** `key` no es editable por PATCH: va en la URL, es inmutable. */
export class UpdateContentBlockDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  body?: string;
}
