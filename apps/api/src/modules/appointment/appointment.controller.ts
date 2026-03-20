import { Body, Controller, Get, Param, Post, Query, Req } from '@nestjs/common';
import { AppointmentStatus } from '@prisma/client';
import type { TenantRequest } from '../../common/tenant-context.middleware';
import { getTenantId } from '../../common/get-tenant-id';
import { AppointmentService } from './appointment/appointment.service';

@Controller()
export class AppointmentController {
  constructor(private readonly appointmentService: AppointmentService) {}

  @Get('guest/availability')
  availability(
    @Req() req: TenantRequest,
    @Query('branchId') branchId: string,
    @Query('serviceId') serviceId: string,
    @Query('date') date: string,
  ) {
    return this.appointmentService.getGuestAvailability({
      tenantId: getTenantId(req),
      branchId,
      serviceId,
      date,
    });
  }

  @Post('guest/reservations')
  createReservation(
    @Req() req: TenantRequest,
    @Body()
    body: {
      branchId: string;
      customerName: string;
      customerPhone?: string;
      serviceId: string;
      staffUserId: string;
      createdByUserId?: string;
      createdByEmail?: string;
      startsAt: string;
    },
  ) {
    return this.appointmentService.createGuestReservation({
      tenantId: getTenantId(req),
      ...body,
    });
  }

  @Get('employee/notifications')
  notifications(@Req() req: TenantRequest, @Query('staffUserId') staffUserId: string) {
    return this.appointmentService.getStaffNotifications({
      tenantId: getTenantId(req),
      staffUserId,
    });
  }

  @Get('employee/reservations')
  listReservations(@Req() req: TenantRequest) {
    return this.appointmentService.listReservations(getTenantId(req));
  }

  @Post('employee/reservations/:id/approve')
  approve(@Req() req: TenantRequest, @Param('id') appointmentId: string, @Body() body: { changedByUserId?: string; changedByEmail?: string; reason?: string }) {
    return this.appointmentService.changeStatus({
      tenantId: getTenantId(req),
      appointmentId,
      changedByUserId: body.changedByUserId,
      changedByEmail: body.changedByEmail,
      toStatus: AppointmentStatus.CONFIRMED,
      reason: body.reason,
    });
  }

  @Post('employee/reservations/:id/start')
  start(@Req() req: TenantRequest, @Param('id') appointmentId: string, @Body() body: { changedByUserId?: string; changedByEmail?: string; reason?: string }) {
    return this.appointmentService.changeStatus({
      tenantId: getTenantId(req),
      appointmentId,
      changedByUserId: body.changedByUserId,
      changedByEmail: body.changedByEmail,
      toStatus: AppointmentStatus.IN_PROGRESS,
      reason: body.reason,
    });
  }

  @Post('employee/reservations/:id/complete')
  complete(@Req() req: TenantRequest, @Param('id') appointmentId: string, @Body() body: { changedByUserId?: string; changedByEmail?: string; reason?: string }) {
    return this.appointmentService.changeStatus({
      tenantId: getTenantId(req),
      appointmentId,
      changedByUserId: body.changedByUserId,
      changedByEmail: body.changedByEmail,
      toStatus: AppointmentStatus.COMPLETED,
      reason: body.reason,
    });
  }
}
