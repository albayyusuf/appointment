import { Body, Controller, Delete, Get, Param, Patch, Post, Req } from '@nestjs/common';
import { TenantService } from './tenant.service';
import { UserStatus, VerticalType } from '@prisma/client';
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

  @Get('roles')
  listRoles(@Req() req: TenantRequest) {
    return this.tenantService.listRoles(getTenantId(req));
  }

  @Post('roles')
  createRole(
    @Req() req: TenantRequest,
    @Body() body: { code: string; name: string; description?: string },
  ) {
    return this.tenantService.createRole({
      tenantId: getTenantId(req),
      code: body.code,
      name: body.name,
      description: body.description,
    });
  }

  @Get('users')
  listUsers(@Req() req: TenantRequest) {
    return this.tenantService.listUsers(getTenantId(req));
  }

  @Post('users')
  createUser(
    @Req() req: TenantRequest,
    @Body()
    body: {
      email: string;
      fullName: string;
      branchId?: string | null;
      isStaff?: boolean;
      specialty?: string | null;
      roleCodes?: string[];
    },
  ) {
    return this.tenantService.createUser(getTenantId(req), body);
  }

  @Patch('users/:id')
  updateUser(
    @Req() req: TenantRequest,
    @Param('id') id: string,
    @Body()
    body: Partial<{
      fullName: string;
      email: string;
      branchId: string | null;
      isStaff: boolean;
      status: UserStatus;
      specialty: string | null;
    }>,
  ) {
    return this.tenantService.updateUser(getTenantId(req), id, body);
  }

  @Delete('users/:id')
  deleteUser(@Req() req: TenantRequest, @Param('id') id: string) {
    return this.tenantService.deleteUser(getTenantId(req), id);
  }
}
