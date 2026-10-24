import { PartialType } from '@nestjs/swagger';
import { CreateEventProgramItemDto } from './create-event-program-item.dto';

export class UpdateEventProgramItemDto extends PartialType(CreateEventProgramItemDto) {}
