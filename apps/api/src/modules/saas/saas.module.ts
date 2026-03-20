import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { SaasController } from './saas.controller';
import { SaasService } from './saas.service';

@Module({
  imports: [PrismaModule],
  controllers: [SaasController],
  providers: [SaasService],
})
export class SaasModule {}
