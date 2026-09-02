/** Backstop de multer (memoria) antes de leer el buffer completo. */
export const EVENT_IMAGE_MAX_BYTES = 5 * 1024 * 1024; // 5 MB

/** Contra `detected.mime` de file-type, nunca contra el mimetype del cliente. */
export const ALLOWED_EVENT_IMAGE_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
]);
