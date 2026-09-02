import { IsOptional, IsString } from 'class-validator';

/** Mismo criterio que CreatePointAdjustmentDto: `reason` opcional acá, obligatorio en el servicio (400 REASON_REQUIRED). */
export class ReverseTransactionDto {
  @IsOptional()
  @IsString()
  reason?: string;
}
