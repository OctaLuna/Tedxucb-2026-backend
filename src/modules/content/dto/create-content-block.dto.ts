import { IsOptional, IsString, Matches, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateContentBlockDto {
  @ApiProperty({ example: 'tedxucb', description: 'Slug del evento dueño del bloque.' })
  @IsString()
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  eventSlug!: string;

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
