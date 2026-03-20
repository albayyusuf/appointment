import { Body, Controller, Get, Post, Query, Req } from '@nestjs/common';
import type { TenantRequest } from '../../common/tenant-context.middleware';
import { getTenantId } from '../../common/get-tenant-id';
import { ServiceCatalogService } from './service-catalog/service-catalog.service';

@Controller('services')
export class ServiceCatalogController {
  constructor(private readonly serviceCatalogService: ServiceCatalogService) {}

  @Get()
  list(
    @Req() req: TenantRequest,
    @Query('branchId') branchId: string,
  ) {
    const tenantId = getTenantId(req);
    if (!branchId) {
      return [];
    }
    return this.serviceCatalogService.getBranchServices(tenantId, branchId);
  }

  @Post()
  create(
    @Req() req: TenantRequest,
    @Body()
    body: {
      branchId: string;
      categoryName: string;
      name: string;
      durationMin: number;
      priceAmount: number;
      currency?: string;
    },
  ) {
    return this.serviceCatalogService.createService({
      tenantId: getTenantId(req),
      ...body,
    });
  }
}
