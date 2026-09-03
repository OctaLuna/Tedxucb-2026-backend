import { IsOptional, IsUUID } from 'class-validator';

/** `limit` se parsea a mano en el controlador, mismo patrón que page/limit del resto de la API -- solo career/faculty necesitan validación de forma (filtran por id). */
export class LeaderboardQueryDto {
  @IsOptional()
  @IsUUID()
  career?: string;

  @IsOptional()
  @IsUUID()
  faculty?: string;
}
