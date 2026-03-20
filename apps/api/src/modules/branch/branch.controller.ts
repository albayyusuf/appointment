import { Controller, Get, Req } from '@nestjs/common';
import { BranchService } from './branch.service';
import type { TenantRequest } from '../../common/tenant-context.middleware';

@Controller('branches')
export class BranchController {
  constructor(private readonly branchService: BranchService) {}

  @Get()
  list(@Req() req: TenantRequest) {
    return this.branchService.listByTenant(req.tenantId!);
  }
}
