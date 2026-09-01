import { IsEmail, IsString, IsUUID, MinLength } from 'class-validator';

export class RegisterDto {
  @IsString()
  @MinLength(1)
  fullName!: string;

  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(1)
  studentCode!: string;

  @IsUUID()
  careerId!: string;

  @IsString()
  @MinLength(1)
  academicPeriod!: string;

  @IsString()
  @MinLength(1)
  phone!: string;

  @IsString()
  @MinLength(10, { message: 'debe tener al menos 10 caracteres' })
  password!: string;

  @IsUUID()
  consentVersionId!: string;
}
