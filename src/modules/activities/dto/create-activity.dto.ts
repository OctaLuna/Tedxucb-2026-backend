import { IsBoolean, IsInt, IsISO8601, IsOptional, IsString, IsUUID, Min, MinLength } from 'class-validator';

/** Nace siempre en DRAFT (RF-303) -- el cliente no puede crearla ya publicada. */
export class CreateActivityDto {
  @IsString()
  @MinLength(1)
  title!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @IsOptional()
  @IsString()
  location?: string;

  @IsInt()
  @Min(1)
  pointsValue!: number;

  @IsISO8601()
  startsAt!: string;

  @IsISO8601()
  endsAt!: string;

  @IsISO8601()
  checkinOpensAt!: string;

  @IsISO8601()
  checkinClosesAt!: string;

  @IsOptional()
  @IsBoolean()
  allowMultipleCheckins?: boolean;
}
