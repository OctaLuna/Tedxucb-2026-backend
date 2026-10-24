import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsDateString, IsEnum, IsInt, IsOptional, IsString, IsUrl, IsUUID, Length, Max, MaxLength, Min, ValidateNested } from 'class-validator';

export const LIVE_MODES = ['schedule', 'active', 'inactive'] as const;
export const LIVE_STATUSES = ['DRAFT', 'PUBLISHED', 'CANCELLED'] as const;
export const LIVE_MEDIA_KINDS = ['image', 'video', 'resource'] as const;

export class EventLiveQuestionDto {
  @ApiProperty() @IsString() @Length(1, 1000) prompt!: string;
  @ApiProperty({ type: [String], minItems: 2, maxItems: 6 }) @IsArray() @ArrayMinSize(2) @ArrayMaxSize(6) @IsString({ each: true }) options!: string[];
  @ApiProperty({ minimum: 0 }) @IsInt() @Min(0) correctOptionIndex!: number;
  @ApiProperty({ minimum: 5, maximum: 120 }) @IsInt() @Min(5) @Max(120) timeLimitSeconds!: number;
  @ApiPropertyOptional({ minimum: 0, default: 0 }) @IsOptional() @IsInt() @Min(0) points?: number;
}

export class EventLiveConfigurationDto {
  @ApiPropertyOptional({ default: false }) @IsOptional() @IsBoolean() enabled?: boolean;
  @ApiPropertyOptional({ type: [EventLiveQuestionDto] }) @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => EventLiveQuestionDto) questions?: EventLiveQuestionDto[];
}

export class EventLiveMediaDto {
  @ApiProperty() @IsString() @Length(1, 180) name!: string;
  @ApiProperty({ enum: LIVE_MEDIA_KINDS }) @IsEnum(LIVE_MEDIA_KINDS) kind!: (typeof LIVE_MEDIA_KINDS)[number];
  @ApiProperty({ format: 'uri' }) @IsUrl({ protocols: ['https'], require_protocol: true }) url!: string;
  @ApiPropertyOptional({ format: 'uri' }) @IsOptional() @IsUrl({ protocols: ['https'], require_protocol: true }) coverUrl?: string;
  @ApiPropertyOptional({ minimum: 0 }) @IsOptional() @IsInt() @Min(0) displayOrder?: number;
}

export class CreateEventLiveActivityDto {
  @ApiProperty() @IsString() @Length(1, 180) title!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(4000) description?: string;
  @ApiPropertyOptional({ format: 'uuid' }) @IsOptional() @IsUUID() agendaSlotId?: string;
  @ApiProperty({ format: 'date-time' }) @IsDateString() startsAt!: string;
  @ApiProperty({ format: 'date-time' }) @IsDateString() endsAt!: string;
  @ApiPropertyOptional({ enum: LIVE_MODES, default: 'schedule' }) @IsOptional() @IsEnum(LIVE_MODES) activationMode?: (typeof LIVE_MODES)[number];
  @ApiPropertyOptional({ enum: LIVE_STATUSES, default: 'DRAFT' }) @IsOptional() @IsEnum(LIVE_STATUSES) status?: (typeof LIVE_STATUSES)[number];
  @ApiPropertyOptional({ minimum: 0 }) @IsOptional() @IsInt() @Min(0) displayOrder?: number;
  @ApiPropertyOptional({ type: EventLiveConfigurationDto }) @IsOptional() @ValidateNested() @Type(() => EventLiveConfigurationDto) configuration?: EventLiveConfigurationDto;
  @ApiPropertyOptional({ type: [EventLiveMediaDto] }) @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => EventLiveMediaDto) media?: EventLiveMediaDto[];
}

export class UpdateEventLiveActivityDto extends PartialType(CreateEventLiveActivityDto) {}

export class UpdateEventLiveSettingsDto {
  @ApiPropertyOptional() @IsOptional() @IsBoolean() enabled?: boolean;
  @ApiPropertyOptional({ format: 'uuid', nullable: true }) @IsOptional() @IsUUID() manualActivityId?: string | null;
}
