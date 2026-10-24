import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsInt, IsOptional, IsString, IsUUID, Length, MaxLength, Min } from 'class-validator';

export const EVENT_PROGRAM_TYPES = ['OPENING', 'TALK', 'BREAK', 'PERFORMANCE', 'CLOSING', 'OTHER'] as const;
export const EVENT_PROGRAM_STATUSES = ['DRAFT', 'PUBLISHED', 'CANCELLED'] as const;

export class CreateEventProgramItemDto {
  @ApiProperty({ example: 'Ideas que abren caminos' })
  @IsString()
  @Length(1, 180)
  title!: string;

  @ApiPropertyOptional({ example: 'Conversación sobre innovación social.' })
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  description?: string;

  @ApiProperty({ enum: EVENT_PROGRAM_TYPES, example: 'TALK' })
  @IsEnum(EVENT_PROGRAM_TYPES)
  type!: (typeof EVENT_PROGRAM_TYPES)[number];

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  speakerId?: string;

  @ApiProperty({ format: 'date-time' })
  @IsDateString()
  startsAt!: string;

  @ApiProperty({ format: 'date-time' })
  @IsDateString()
  endsAt!: string;

  @ApiPropertyOptional({ minimum: 0, default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  displayOrder?: number;

  @ApiPropertyOptional({ enum: EVENT_PROGRAM_STATUSES, default: 'DRAFT' })
  @IsOptional()
  @IsEnum(EVENT_PROGRAM_STATUSES)
  status?: (typeof EVENT_PROGRAM_STATUSES)[number];
}
