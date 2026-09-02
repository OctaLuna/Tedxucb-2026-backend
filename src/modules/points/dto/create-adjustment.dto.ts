import { IsIn, IsInt, IsOptional, IsString, IsUUID } from 'class-validator';

/**
 * `reason` va opcional acá a propósito: el contrato promete `400
 * REASON_REQUIRED` tanto para motivo ausente como vacío (un solo código
 * para ambos casos), así que el chequeo real vive en el servicio -- si
 * fuera `@IsNotEmpty()` acá, un motivo ausente lo interceptaría el
 * ValidationPipe genérico como VALIDATION_ERROR antes de llegar a esa
 * lógica, dando dos códigos distintos para el mismo caso "ausente o
 * vacío" (a diferencia de ManualCheckinDto, cuyo contrato no promete un
 * código propio).
 */
export class CreatePointAdjustmentDto {
  @IsUUID()
  studentId!: string;

  @IsInt()
  points!: number;

  @IsIn(['BONUS', 'PENALTY', 'ADJUSTMENT'])
  type!: 'BONUS' | 'PENALTY' | 'ADJUSTMENT';

  @IsOptional()
  @IsString()
  reason?: string;
}
