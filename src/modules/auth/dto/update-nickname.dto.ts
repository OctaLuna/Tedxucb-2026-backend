import { ApiProperty } from '@nestjs/swagger';
import { Allow } from 'class-validator';

export class UpdateNicknameDto {
  @ApiProperty({ example: 'Luna27', description: 'Al menos tres letras o números, sin espacios ni símbolos.' })
  @Allow()
  nickname!: unknown;
}
