import { IsIn } from 'class-validator';

export class GrantRoleDto {
  @IsIn(['ADMIN', 'STAFF', 'ALUMNO'])
  role!: 'ADMIN' | 'STAFF' | 'ALUMNO';
}
