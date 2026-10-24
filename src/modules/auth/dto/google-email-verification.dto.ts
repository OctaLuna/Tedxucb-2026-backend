import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';
import { SUPPORTED_EVENT_SLUGS, type SupportedEventSlug } from '../../../common/events/supported-event-slugs';
import { GoogleLoginDto } from './google-login.dto';

export class GoogleEmailVerificationDto extends GoogleLoginDto {
  @ApiProperty({ enum: SUPPORTED_EVENT_SLUGS, description: 'Evento desde el que se solicita verificar el correo.' })
  @IsIn(SUPPORTED_EVENT_SLUGS)
  eventSlug!: SupportedEventSlug;
}
