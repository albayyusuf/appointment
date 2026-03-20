import { Module } from '@nestjs/common';
import { ServiceCatalogService } from './service-catalog/service-catalog.service';
import { CacheModule } from '../cache/cache.module';
import { PrismaModule } from '../prisma/prisma.module';
import { ServiceCatalogController } from './service-catalog.controller';

@Module({
  imports: [CacheModule, PrismaModule],
  controllers: [ServiceCatalogController],
  providers: [ServiceCatalogService],
  exports: [ServiceCatalogService],
})
export class ServiceCatalogModule {}
