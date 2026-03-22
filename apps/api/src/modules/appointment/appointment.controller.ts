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
    @Query('staffUserId') staffUserId?: string,
  ) {
    return this.appointmentService.getGuestAvailability({
      tenantId: getTenantId(req),
      branchId,
      serviceId,
      date,
      staffUserId: staffUserId || undefined,
    });
  }

  @Get('guest/customer-notifications')
  customerNotifications(@Req() req: TenantRequest, @Query('phone') phone?: string, @Query('email') email?: string) {
    return this.appointmentService.getCustomerNotifications({
      tenantId: getTenantId(req),
      phone,
      email,
    });
  }

  @Get('guest/staff-calendar')
  staffCalendar(
    @Req() req: TenantRequest,
    @Query('branchId') branchId: string,
    @Query('date') date: string,
    @Query('serviceId') serviceId?: string,
  ) {
    return this.appointmentService.getStaffDayCalendar({
      tenantId: getTenantId(req),
      branchId,
      date,
      serviceId,
    });
  }

  /** Restoran alanları (bahçe, teras…) — misafir seçim listesi */
  @Get('guest/restaurant-areas')
  restaurantAreas(@Req() req: TenantRequest, @Query('branchId') branchId: string) {
    return this.appointmentService.listRestaurantAreas(getTenantId(req), branchId);
  }

  /** Seçilen gün için özel ücret / etiket özeti */
  @Get('guest/pricing-hint')
  pricingHint(@Req() req: TenantRequest, @Query('branchId') branchId: string, @Query('date') date: string) {
    return this.appointmentService.getGuestPricingHint({
      tenantId: getTenantId(req),
      branchId,
      date,
    });
  }

  /** İşletme: şubedeki önemli gün kuralları listesi */
  @Get('employee/branch-pricing-days')
  listPricingDays(@Req() req: TenantRequest, @Query('branchId') branchId: string) {
    return this.appointmentService.listBranchPricingDays({
      tenantId: getTenantId(req),
      branchId,
    });
  }

  /** İşletme: önemli gün fiyat kuralı (yüzde ve/veya sabit ek) */
  @Post('employee/branch-pricing-day')
  upsertPricingDay(
    @Req() req: TenantRequest,
    @Body()
    body: {
      branchId: string;
      dateYmd: string;
      label?: string;
      surchargePercent?: number | null;
      extraAmount?: number | null;
      note?: string | null;
      isActive?: boolean;
    },
  ) {
    return this.appointmentService.upsertBranchPricingDay({
      tenantId: getTenantId(req),
      branchId: body.branchId,
      dateYmd: body.dateYmd,
      label: body.label,
      surchargePercent: body.surchargePercent,
      extraAmount: body.extraAmount,
      note: body.note,
      isActive: body.isActive,
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
      customerEmail?: string;
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
  listReservations(@Req() req: TenantRequest, @Query('status') status?: AppointmentStatus) {
    return this.appointmentService.listReservations(getTenantId(req), status);
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

  @Post('employee/reservations/:id/cancel')
  cancel(@Req() req: TenantRequest, @Param('id') appointmentId: string, @Body() body: { changedByUserId?: string; changedByEmail?: string; reason?: string }) {
    return this.appointmentService.cancelReservation({
      tenantId: getTenantId(req),
      appointmentId,
      changedByUserId: body.changedByUserId,
      changedByEmail: body.changedByEmail,
      reason: body.reason,
    });
  }
}
