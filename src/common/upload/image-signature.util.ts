/**
 * Detección de tipo de imagen por bytes mágicos, sin depender de un
 * paquete externo. `file-type` (usado antes) se publica como ESM puro y
 * ningún truco de import dinámico resultó confiable a la vez en el
 * runtime de funciones de Vercel (ERR_REQUIRE_ESM con require() normal,
 * con import() downlevelado por TypeScript a require() otra vez) y en el
 * sandbox de VM modules de Jest (import() vía `new Function` fallaba de
 * forma intermitente corriendo la suite completa, aunque pasaba aislado
 * -- bug real, no hipotético). Los cuatro formatos que este proyecto
 * admite tienen firmas de bytes estables y triviales de verificar
 * (skill seguridad-y-roles: "validación de tipo real", nunca el
 * mimetype que manda el cliente) -- esto es más simple y más auditable
 * que seguir peleando con la interoperabilidad ESM/CJS de una
 * dependencia externa para cuatro casos.
 */
export interface DetectedImage {
  readonly ext: string;
  readonly mime: string;
}

type Signature = DetectedImage & { magic: (buffer: Buffer) => boolean };

const SIGNATURES: Signature[] = [
  {
    ext: 'png',
    mime: 'image/png',
    magic: (b) => b.length >= 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  },
  {
    ext: 'jpg',
    mime: 'image/jpeg',
    magic: (b) => b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  },
  {
    ext: 'gif',
    mime: 'image/gif',
    magic: (b) =>
      b.length >= 6 &&
      b.subarray(0, 4).toString('ascii') === 'GIF8' &&
      (b[4] === 0x37 || b[4] === 0x39) &&
      b[5] === 0x61,
  },
  {
    ext: 'webp',
    mime: 'image/webp',
    magic: (b) =>
      b.length >= 12 &&
      b.subarray(0, 4).toString('ascii') === 'RIFF' &&
      b.subarray(8, 12).toString('ascii') === 'WEBP',
  },
];

/** Nunca confía en el mimetype del cliente -- sniffea los bytes reales. */
export function detectImage(buffer: Buffer): DetectedImage | undefined {
  const match = SIGNATURES.find((sig) => sig.magic(buffer));
  return match ? { ext: match.ext, mime: match.mime } : undefined;
}
