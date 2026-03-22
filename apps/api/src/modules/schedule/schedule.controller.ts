import { Body, Controller, Delete, Get, Param, Post, Query, Req } from '@nestjs/common';
import type { TenantRequest } from '../../common/tenant-context.middleware';
import { getTenantId } from '../../common/get-tenant-id';
import { ScheduleService } from './schedule.service';

@Controller('schedules')
export class ScheduleController {
  constructor(private readonly scheduleService: ScheduleService) {}

  @Get()
  list(
    @Req() req: TenantRequest,
    @Query('branchId') branchId?: string,
    @Query('staffUserId') staffUserId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.scheduleService.list({
      tenantId: getTenantId(req),
      branchId,
      staffUserId,
      from,
      to,
    });
  }

  @Post()
  create(
    @Req() req: TenantRequest,
    @Body() body: { branchId: string; staffUserId: string; startsAt: string; endsAt: string },
  ) {
    return this.scheduleService.create({
      tenantId: getTenantId(req),
      ...body,
    });
  }

  @Delete(':id')
  remove(@Req() req: TenantRequest, @Param('id') id: string) {
    return this.scheduleService.delete(getTenantId(req), id);
  }
}
