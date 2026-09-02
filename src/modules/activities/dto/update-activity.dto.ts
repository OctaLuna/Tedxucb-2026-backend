import { IsBoolean, IsIn, IsInt, IsISO8601, IsOptional, IsString, IsUUID, Min, MinLength } from 'class-validator';
import { ACTIVITY_STATUS } from '../activities.constants';

/**
 * status transiciona la máquina de estados (ver activities.constants.ts).
 * Cancelar con reversión en bloque va por POST /:id/cancel, no por acá --
 * es una operación compuesta, no un cambio de campo simple.
 */
export class UpdateActivityDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @IsOptional()
  @IsString()
  location?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  pointsValue?: number;

  @IsOptional()
  @IsISO8601()
  startsAt?: string;

  @IsOptional()
  @IsISO8601()
  endsAt?: string;

  @IsOptional()
  @IsISO8601()
  checkinOpensAt?: string;

  @IsOptional()
  @IsISO8601()
  checkinClosesAt?: string;

  @IsOptional()
  @IsBoolean()
  allowMultipleCheckins?: boolean;

  @IsOptional()
  @IsIn(Object.values(ACTIVITY_STATUS))
  status?: string;
}
