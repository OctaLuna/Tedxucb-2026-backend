import { IsString, MinLength } from 'class-validator';

export class AcceptInvitationDto {
  @IsString()
  @MinLength(1)
  token!: string;

  @IsString()
  @MinLength(10, { message: 'debe tener al menos 10 caracteres' })
  password!: string;
}
