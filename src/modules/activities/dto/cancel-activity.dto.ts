import { IsBoolean } from 'class-validator';

/** El admin decide explícitamente si revierte -- nunca por default (RF-308). */
export class CancelActivityDto {
  @IsBoolean()
  revertPoints!: boolean;
}
