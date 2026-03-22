import { Body, Controller, Delete, Get, Param, Patch, Post, Req } from '@nestjs/common';
import { BranchService } from './branch.service';
import type { TenantRequest } from '../../common/tenant-context.middleware';

@Controller('branches')
export class BranchController {
  constructor(private readonly branchService: BranchService) {}

  @Get()
  list(@Req() req: TenantRequest) {
    return this.branchService.listByTenant(req.tenantId!);
  }

  @Post()
  create(
    @Req() req: TenantRequest,
    @Body()
    body: {
      name: string;
      code: string;
      phone?: string;
      addressLine?: string;
      city?: string;
      country?: string;
      parentBranchId?: string | null;
    },
  ) {
    return this.branchService.createBranch(req.tenantId!, body);
  }

  @Patch(':id')
  update(
    @Req() req: TenantRequest,
    @Param('id') id: string,
    @Body()
    body: Partial<{
      name: string;
      code: string;
      phone: string | null;
      addressLine: string | null;
      city: string | null;
      country: string | null;
      isActive: boolean;
      parentBranchId: string | null;
    }>,
  ) {
    return this.branchService.updateBranch(req.tenantId!, id, body);
  }

  @Delete(':id')
  remove(@Req() req: TenantRequest, @Param('id') id: string) {
    return this.branchService.deleteBranch(req.tenantId!, id);
  }
}
