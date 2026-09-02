import { IsArray, IsOptional, IsString, IsUUID } from 'class-validator';

export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  bio?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  interests?: string[];

  @IsOptional()
  @IsString()
  accessibilityNeeds?: string;

  @IsOptional()
  @IsString()
  professionalLink?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  // Declarados explícitamente (no "cualquier extra") para que el servicio
  // pueda detectarlos y rechazarlos con FIELD_LOCKED cuando la cuenta ya
  // está ACTIVE -- con whitelist:true, un campo no declarado se descarta
  // en silencio antes de llegar al servicio.
  @IsOptional()
  @IsString()
  studentCode?: string;

  @IsOptional()
  @IsUUID()
  careerId?: string;
}
