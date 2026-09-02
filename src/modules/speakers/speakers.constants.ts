/** Mismo allowlist que content (Artículo VII: no hay motivo para uno distinto). */
export const SPEAKER_PHOTO_MAX_BYTES = 5 * 1024 * 1024; // 5 MB

export const ALLOWED_SPEAKER_PHOTO_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
]);
