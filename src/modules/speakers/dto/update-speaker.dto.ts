import { IsIn, IsOptional, IsString, MinLength } from 'class-validator';

/**
 * Sin photoUrl (solo por POST /:id/photo — es un archivo, no texto) ni
 * displayOrder (solo por /reorder). photoAltText SÍ va acá: es texto de
 * accesibilidad (RF-217) que el admin escribe junto con la foto, no parte
 * del archivo en sí.
 */
export class UpdateSpeakerDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  fullName?: string;

  @IsOptional()
  @IsString()
  headline?: string;

  @IsOptional()
  @IsString()
  bio?: string;

  @IsOptional()
  @IsString()
  talkTitle?: string;

  @IsOptional()
  @IsString()
  photoAltText?: string;

  @IsOptional()
  @IsIn(['DRAFT', 'PUBLISHED'])
  status?: string;
}
