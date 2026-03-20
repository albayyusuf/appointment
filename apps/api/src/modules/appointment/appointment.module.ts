import { Module } from '@nestjs/common';
import { AppointmentService } from './appointment/appointment.service';
import { ServiceCatalogModule } from '../service-catalog/service-catalog.module';
import { PrismaModule } from '../prisma/prisma.module';
import { AppointmentController } from './appointment.controller';

@Module({
  imports: [ServiceCatalogModule, PrismaModule],
  controllers: [AppointmentController],
  providers: [AppointmentService],
})
export class AppointmentModule {}
