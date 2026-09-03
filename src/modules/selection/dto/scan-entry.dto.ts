import { IsString } from 'class-validator';

export class ScanEntryDto {
  @IsString()
  entryCode!: string;
}
