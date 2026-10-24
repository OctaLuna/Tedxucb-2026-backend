import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import * as path from 'node:path';
import { put } from '@vercel/blob';
import { AppException } from '../exceptions/app.exception';
import { detectImage } from './image-signature.util';

export type UploadKind = 'avatars' | 'events' | 'speakers';

/**
 * Use Vercel Blob only in production with an explicit credential. Local
 * development and tests write to ./uploads, even if .env contains a Blob
 * token, so local verification cannot mutate remote storage by accident.
 * Image validation and UUID naming are identical in both paths.
 */
@Injectable()
export class UploadService {
  private readonly useBlob = process.env.NODE_ENV === 'production' && Boolean(process.env.BLOB_READ_WRITE_TOKEN);
  private readonly localDir: string | undefined = this.useBlob ? undefined : path.resolve('./uploads');

  async upload(kind: UploadKind, buffer: Buffer | undefined): Promise<string> {
    if (!buffer || buffer.length === 0) {
      throw new AppException(422, 'INVALID_IMAGE', 'No se recibió ningún archivo.');
    }

    const detected = detectImage(buffer);
    if (!detected) {
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
