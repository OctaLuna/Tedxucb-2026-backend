import { Transform, Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class ListEventAccessQueryDto {
  @ApiPropertyOptional({ minimum: 1, maximum: 1_000_000, default: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1_000_000)
  page = 1;

  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 20 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;

  @ApiPropertyOptional({ description: 'Busca por una parte del correo, sin distinguir mayúsculas.' })
  @IsOptional()
  @IsString()
  @MaxLength(254)
  @Transform(({ value }) => typeof value === 'string' ? value.trim().toLowerCase() : value)
  email?: string;

  @ApiPropertyOptional({ enum: ['active', 'revoked', 'all'], default: 'active' })
  @IsOptional()
  @IsIn(['active', 'revoked', 'all'])
  status: 'active' | 'revoked' | 'all' = 'active';
}
