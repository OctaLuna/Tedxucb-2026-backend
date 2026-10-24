import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsIn, IsString, MaxLength, MinLength } from 'class-validator';
import { SUPPORTED_EVENT_SLUGS, type SupportedEventSlug } from '../../../common/events/supported-event-slugs';

export class IdentityEmailTokenDto {
  @ApiProperty({ description: 'Token opaco recibido por correo.' })
  @IsString()
  @MinLength(32)
  @MaxLength(256)
  token!: string;
}

export class IdentityInvitationDto {
  @ApiProperty({ example: 'persona@ejemplo.com' })
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @ApiProperty({ enum: SUPPORTED_EVENT_SLUGS, description: 'Frontend del evento autorizado al que abre la invitacion.' })
  @IsIn(SUPPORTED_EVENT_SLUGS)
  eventSlug!: SupportedEventSlug;
}
