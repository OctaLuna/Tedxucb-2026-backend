import { IsIn, IsOptional, IsString } from 'class-validator';

/**
 * El DTO admite "CONVERTED" sintácticamente a propósito: si lo excluyera,
 * class-validator lo rechazaría como 400 VALIDATION_ERROR genérico antes de
 * llegar al servicio, y el contrato exige el 422 INVALID_STATUS explícito
 * que solo el servicio puede distinguir (applications.service.ts).
 */
export class UpdateApplicationDto {
  @IsOptional()
  @IsIn(['ACCEPTED', 'REJECTED', 'NOT_TED_FORMAT', 'CONVERTED'])
  status?: string;

  @IsOptional()
  @IsString()
  internalNotes?: string;
}
