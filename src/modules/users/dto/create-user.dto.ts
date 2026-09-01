import { ArrayMinSize, IsArray, IsEmail, IsIn, IsString, MinLength } from 'class-validator';

export class CreateUserDto {
  @IsString()
  @MinLength(1)
  fullName!: string;

  @IsEmail()
  email!: string;

  @IsArray()
  @ArrayMinSize(1)
  @IsIn(['ADMIN', 'STAFF'], { each: true })
  roles!: ('ADMIN' | 'STAFF')[];
}
