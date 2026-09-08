import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import * as path from 'node:path';
import { put } from '@vercel/blob';
import { AppException } from '../exceptions/app.exception';

export type UploadKind = 'avatars' | 'events' | 'speakers';

/**
 * Un solo allowlist para los tres sitios de subida (avatar, imagen de
 * evento, foto de speaker) -- estaban triplicados con el mismo Set exacto
 * (skill seguridad-y-roles: "validación de tipo real").
 */
const ALLOWED_IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

/**
 * Sube a Vercel Blob cuando hay credenciales (producción); si no
 * (desarrollo/pruebas, sin cuenta de Vercel Blob ni emulador local
 * disponible), cae a disco local bajo ./uploads/<kind>/, servido por
 * main.ts solo en ese caso -- mismo principio de *fallback* por entorno
 * que MailService usa con QStash. La validación real (bytes con
 * file-type, nunca el mimetype del cliente) y el renombrado a UUID son
 * iguales en ambos casos.
 */
@Injectable()
export class UploadService {
  private readonly localDir: string | undefined = process.env.BLOB_READ_WRITE_TOKEN
    ? undefined
    : path.resolve('./uploads');

  async upload(kind: UploadKind, buffer: Buffer | undefined): Promise<string> {
    if (!buffer || buffer.length === 0) {
      throw new AppException(422, 'INVALID_IMAGE', 'No se recibió ningún archivo.');
    }

    // Import dinámico, no estático: file-type se publica como ESM puro y
    // el require() que genera la compilación a CommonJS de este archivo no
    // puede cargarlo en el runtime de funciones de Vercel (ERR_REQUIRE_ESM
    // real, detectado en el primer deploy) -- import() sí funciona en
    // cualquier entorno, sea CJS o ESM.
    const { fileTypeFromBuffer } = await import('file-type');
    const detected = await fileTypeFromBuffer(buffer);
    if (!detected || !ALLOWED_IMAGE_MIME_TYPES.has(detected.mime)) {
      throw new AppException(422, 'INVALID_IMAGE', 'El archivo no es una imagen válida en un formato admitido.');
    }

    const filename = `${randomUUID()}.${detected.ext}`;

    if (this.localDir) {
      const dir = path.join(this.localDir, kind);
      await mkdir(dir, { recursive: true });
      await writeFile(path.join(dir, filename), buffer);
      return `/uploads/${kind}/${filename}`;
    }

    const blob = await put(`${kind}/${filename}`, buffer, { access: 'public' });
    return blob.url;
  }
}
