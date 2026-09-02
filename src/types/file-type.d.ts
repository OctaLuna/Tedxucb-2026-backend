/**
 * `file-type` declara sus tipos solo vía el campo `exports` de su
 * package.json, que requiere `moduleResolution: "bundler"|"node16"|
 * "nodenext"` para resolverse -- este proyecto usa `"node"` (clásico) en
 * todo lo demás, y cambiarlo globalmente a mitad de proyecto es más
 * riesgo del que justifica esta única dependencia. Shim acotado con solo
 * lo que se usa (`fileTypeFromBuffer`).
 */
declare module 'file-type' {
  export interface FileTypeResult {
    readonly ext: string;
    readonly mime: string;
  }

  export function fileTypeFromBuffer(
    buffer: Uint8Array | ArrayBuffer,
  ): Promise<FileTypeResult | undefined>;
}
