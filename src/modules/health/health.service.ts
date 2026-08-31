import { Injectable } from '@nestjs/common';

@Injectable()
export class HealthService {
  check(): { status: 'ok' } {
    return { status: 'ok' };
  }
}
