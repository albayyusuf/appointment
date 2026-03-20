import { Body, Controller, Get, Post, Req } from '@nestjs/common';
import { TenantService } from './tenant.service';
import { VerticalType } from '@prisma/client';
import type { TenantRequest } from '../../common/tenant-context.middleware';
import { getTenantId } from '../../common/get-tenant-id';

type BootstrapTenantDto = {
  name: string;
  slug: string;
  vertical?: VerticalType;
  defaultCurrency?: string;
};

@Controller('tenants')
export class TenantController {
  constructor(private readonly tenantService: TenantService) {}

  @Get('current')
  getCurrent(@Req() req: TenantRequest) {
    return this.tenantService.getCurrentTenant(getTenantId(req));
  }

  @Post('bootstrap')
  bootstrap(@Body() body: BootstrapTenantDto) {
    return this.tenantService.bootstrapTenant({
      name: body.name,
      slug: body.slug,
      vertical: body.vertical ?? VerticalType.BEAUTY,
      defaultCurrency: body.defaultCurrency ?? 'TRY',
    });
  }

  @Post('settings/currency')
  setCurrency(@Req() req: TenantRequest, @Body() body: { currency: string }) {
    return this.tenantService.setDefaultCurrency(getTenantId(req), body.currency);
  }
}
