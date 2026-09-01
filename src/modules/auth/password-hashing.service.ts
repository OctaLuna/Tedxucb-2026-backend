import { Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';

/**
 * T030. Pura respecto a Nest: invocable desde una prueba unitaria sin
 * levantar HTTP ni base de datos (Artículo I).
 */
@Injectable()
export class PasswordHashingService {
  async hash(plainPassword: string): Promise<string> {
    return argon2.hash(plainPassword, { type: argon2.argon2id });
  }

  async verify(hash: string, plainPassword: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, plainPassword);
    } catch {
      // Un hash con formato corrupto o de otro algoritmo nunca debe tumbar
      // el login: se trata como contraseña incorrecta.
      return false;
    }
  }
}
