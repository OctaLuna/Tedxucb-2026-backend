import { IsOptional, IsString } from 'class-validator';

/** Compartido por revert y revoke -- ambos exigen motivo, mismo criterio de validación que ManualSelectionDto. */
export class ReasonDto {
  @IsOptional()
  @IsString()
  reason?: string;
}
