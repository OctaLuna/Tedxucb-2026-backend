import { IsOptional, IsString, MinLength } from 'class-validator';

/**
 * Sin status/displayOrder: el servidor fuerza DRAFT siempre y displayOrder
 * nace en el default de BD (0) -- se gestiona exclusivamente vía
 * POST /speakers/reorder, nunca desde create/update (evita dos caminos
 * distintos para tocar el mismo campo).
 */
export class CreateSpeakerDto {
  @IsString()
  @MinLength(1)
  fullName!: string;

  @IsOptional()
  @IsString()
  headline?: string;

  @IsOptional()
  @IsString()
  bio?: string;

  @IsOptional()
  @IsString()
  talkTitle?: string;
}
