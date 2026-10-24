import { Transform } from 'class-transformer';
import { ArrayMinSize, ArrayUnique, IsArray, IsEmail, IsOptional, IsUUID } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { normalizeEmail } from '../../../common/utils/normalize-email.util';

export class SetEventAccessDto {
  @ApiProperty({ example: 'persona@example.com' })
  @Transform(({ value }) => typeof value === 'string' ? normalizeEmail(value) : value)
  @IsEmail()
  email!: string;

  @ApiPropertyOptional({ type: [String], description: 'IDs de eventos que administra la cuenta. Si se omite, se usan todos los eventos permitidos al administrador (TEDxUCB e Innovation Week por defecto cuando tiene ambos scopes).' })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @IsUUID('4', { each: true })
  eventIds?: string[];
}
