import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class GoogleLoginDto {
  @ApiProperty({ description: 'ID token firmado por Google Identity Services.' })
  @IsString()
  @MinLength(1)
  @MaxLength(16384)
  credential!: string;

  @ApiProperty({ description: 'Nonce de un solo uso obtenido de /auth/google/challenge.' })
  @IsString()
  @MinLength(32)
  @MaxLength(128)
  nonce!: string;
}
