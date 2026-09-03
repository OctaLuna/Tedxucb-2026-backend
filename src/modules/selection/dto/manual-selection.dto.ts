import { IsEmail, IsOptional, IsString, IsUUID } from 'class-validator';

/**
 * `reason` opcional acá a propósito: el contrato promete REASON_REQUIRED
 * para motivo ausente o vacío -- mismo criterio que CreatePointAdjustmentDto
 * de `points` (003-b), el chequeo real vive en el servicio para no darle
 * dos códigos distintos al mismo caso.
 */
export class ManualSelectionDto {
  @IsOptional()
  @IsUUID()
  studentId?: string;

  @IsOptional()
  @IsString()
  fullName?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  audienceType?: string;

  @IsOptional()
  @IsString()
  reason?: string;
}
