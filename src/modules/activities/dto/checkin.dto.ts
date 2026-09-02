import { IsOptional, IsString } from 'class-validator';

export class CheckinDto {
  @IsString()
  qrToken!: string;

  /** RF-321: identificador estable del dispositivo del staff, para anomalías. */
  @IsOptional()
  @IsString()
  deviceHash?: string;
}
