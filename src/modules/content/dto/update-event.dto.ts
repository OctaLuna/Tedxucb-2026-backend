import { IsIn, IsInt, IsISO8601, IsOptional, IsString, Min, MinLength } from 'class-validator';

/**
 * `imageUrl` no está aquí: el contrato solo la cambia por
 * POST /events/:id/image. Con whitelist:true global, si llega igual se
 * descarta en silencio.
 */
export class UpdateEventDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsString()
  tagline?: string;

  @IsOptional()
  @IsISO8601()
  startsAt?: string;

  @IsOptional()
  @IsString()
  venue?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  capacity?: number;

  /** RF-401 (004): cuántos de los lugares totales se disputan por ranking de puntos. */
  @IsOptional()
  @IsInt()
  @Min(1)
  studentCapacity?: number;

  @IsOptional()
  @IsIn(['DRAFT', 'PUBLISHED'])
  status?: string;
}
