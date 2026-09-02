import { IsNotEmpty, IsString, IsUUID } from 'class-validator';

/** RF-319: la nota es obligatoria -- el CHECK manual_requires_note es la garantía real. */
export class ManualCheckinDto {
  @IsUUID()
  studentId!: string;

  @IsString()
  @IsNotEmpty()
  note!: string;
}
