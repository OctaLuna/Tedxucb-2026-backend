import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthController } from './auth.controller';
import { MeController } from './me.controller';
import { AuthService } from './auth.service';
import { PasswordHashingService } from './password-hashing.service';
import { TokenPairService } from './token-pair.service';
import { OneTimeTokenService } from './one-time-token.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import type { EnvConfig } from '../../config/env.validation';
import { GoogleAuthService } from './google-auth.service';
import { MailModule } from '../../common/mail/mail.module';
import { AvatarBridgeTokenService } from './avatar-bridge-token.service';
import { ConfiguredAdminAccessService } from './configured-admin-access.service';

@Module({
  imports: [
    MailModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService<EnvConfig, true>) => ({
        secret: config.get('JWT_SECRET', { infer: true }),
      }),
    }),
  ],
  controllers: [AuthController, MeController],
  providers: [
    AuthService,
    GoogleAuthService,
    AvatarBridgeTokenService,
    ConfiguredAdminAccessService,
    PasswordHashingService,
    TokenPairService,
    OneTimeTokenService,
    JwtAuthGuard,
    RolesGuard,
  ],
  exports: [
    PasswordHashingService,
    TokenPairService,
    OneTimeTokenService,
    JwtAuthGuard,
    RolesGuard,
    GoogleAuthService,
    JwtModule,
  ],
})
export class AuthModule {}
