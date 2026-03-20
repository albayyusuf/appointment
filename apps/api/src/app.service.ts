import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  root() {
    return {
      name: 'Appointment API',
      status: 'ok',
    };
  }

  health() {
    return {
      status: 'healthy',
      timestamp: new Date().toISOString(),
    };
  }
}
