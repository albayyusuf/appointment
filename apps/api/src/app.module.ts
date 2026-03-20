import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './modules/auth/auth.module';
import { TenantModule } from './modules/tenant/tenant.module';
import { BranchModule } from './modules/branch/branch.module';
import { StaffModule } from './modules/staff/staff.module';
import { ServiceCatalogModule } from './modules/service-catalog/service-catalog.module';
import { AppointmentModule } from './modules/appointment/appointment.module';
import { CacheModule } from './modules/cache/cache.module';
import { PrismaModule } from './modules/prisma/prisma.module';
import { TenantContextMiddleware } from './common/tenant-context.middleware';
import { SaasModule } from './modules/saas/saas.module';
import { AccountingModule } from './modules/accounting/accounting.module';

@Module({
  imports: [AuthModule, TenantModule, BranchModule, StaffModule, ServiceCatalogModule, AppointmentModule, CacheModule, PrismaModule, SaasModule, AccountingModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(TenantContextMiddleware).forRoutes('*');
  }
}
