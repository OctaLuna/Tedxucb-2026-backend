import { Allow } from 'class-validator';

export class UpdateRegistrationDto {
  @Allow()
  nickname!: unknown;

  @Allow()
  phone!: unknown;
}
