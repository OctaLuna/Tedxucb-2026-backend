import { IsUUID } from 'class-validator';

export class AssignStaffDto {
  @IsUUID()
  userId!: string;
}
