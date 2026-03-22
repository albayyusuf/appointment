import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
import { BranchService } from './branch.service';

/**
 * Misafir rezervasyonu: şube listesi.
 * GET /guest/branches?tenantId=... — query Nest tarafından parse edilir; middleware tenant istemez.
 */
@Controller('guest')
export class GuestBranchController {
  constructor(private readonly branchService: BranchService) {}

  @Get('branches')
  list(@Query('tenantId') tenantId: string) {
    const tid = tenantId?.trim();
    if (!tid) {
      throw new BadRequestException('Missing tenantId query parameter');
    }
    return this.branchService.listByTenant(tid);
  }
}
