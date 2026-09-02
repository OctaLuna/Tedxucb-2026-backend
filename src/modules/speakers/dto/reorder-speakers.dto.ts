import { IsArray, IsUUID } from 'class-validator';

/**
 * Sin @ArrayNotEmpty(): un arreglo vacío es válido cuando no hay ningún
 * speaker todavía (Historia 3, caso borde real).
 */
export class ReorderSpeakersDto {
  @IsArray()
  @IsUUID('4', { each: true })
  ids!: string[];
}
