import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { PlatformSaasController } from './platform-saas.controller';
import { SaasController } from './saas.controller';
import { SaasService } from './saas.service';

@Module({
  imports: [PrismaModule],
  controllers: [SaasController, PlatformSaasController],
  providers: [SaasService],
})
export class SaasModule {}
