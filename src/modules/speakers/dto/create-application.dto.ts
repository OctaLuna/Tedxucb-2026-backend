import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateApplicationDto {
  @IsString()
  @MinLength(1)
  fullName!: string;

  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(1)
  affiliation!: string;

  @IsString()
  @MinLength(1)
  expertiseArea!: string;

  @IsString()
  @MinLength(1)
  ideaTitle!: string;

  @IsString()
  @MinLength(1)
  ideaSummary!: string;

  @IsString()
  @MinLength(1)
  evidenceBasis!: string;

  @IsString()
  @MinLength(1)
  applicability!: string;

  /** Campo señuelo: el frontend lo renderiza oculto. Nunca lo llena un humano. */
  @IsOptional()
  @IsString()
  website?: string;
}
