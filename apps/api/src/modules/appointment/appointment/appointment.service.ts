import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AppointmentStatus, Prisma, UserStatus, VerticalType } from '@prisma/client';
import { ServiceCatalogService } from '../../service-catalog/service-catalog/service-catalog.service';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class AppointmentService {
  constructor(
    private readonly serviceCatalog: ServiceCatalogService,
    private readonly prisma: PrismaService,
  ) {}

  private async resolveGuestActorUserId(tenantId: string): Promise<string> {
    const u = await this.prisma.user.findFirst({
      where: { tenantId, deletedAt: null, status: UserStatus.ACTIVE },
      orderBy: { createdAt: 'asc' },
    });
    if (!u) {
      throw new BadRequestException('No active tenant user to attribute guest booking');
    }
    return u.id;
  }

  /** Özel gün kuralı + taban fiyat → tahsilat tutarı (ledger için) */
  private async resolveCompletedIncomeAmount(
    tenantId: string,
    branchId: string,
    serviceId: string,
    startsAt: Date,
  ): Promise<{ amount: Prisma.Decimal; currency: string }> {
    const service = await this.prisma.service.findFirstOrThrow({
      where: { id: serviceId, tenantId },
      select: { priceAmount: true, currency: true },
    });
    const tenant = await this.prisma.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { defaultCurrency: true } });
    const day = new Date(Date.UTC(startsAt.getUTCFullYear(), startsAt.getUTCMonth(), startsAt.getUTCDate()));
    const rule = await this.prisma.branchPricingDay.findFirst({
      where: { branchId, tenantId, date: day, isActive: true },
    });
    let amount = Number(service.priceAmount);
    if (rule) {
      if (rule.surchargePercent != null) {
        amount *= 1 + Number(rule.surchargePercent) / 100;
      }
      if (rule.extraAmount != null) {
        amount += Number(rule.extraAmount);
      }
    }
    const currency = service.currency || tenant.defaultCurrency;
    return { amount: new Prisma.Decimal(amount.toFixed(2)), currency };
  }

  async onServiceUpdated(tenantId: string, branchId: string): Promise<void> {
    await this.serviceCatalog.invalidateBranchServices(tenantId, branchId);
  }

  /**
   * Misafir rezervasyonu. RESTAURANT dikeyinde `staffUserId` alanı aslında restaurant alan id’sidir (API uyumu).
   */
  async createGuestReservation(input: {
    tenantId: string;
    branchId: string;
    customerName: string;
    customerPhone?: string;
    customerEmail?: string;
    serviceId: string;
    staffUserId: string;
    createdByUserId?: string;
    createdByEmail?: string;
    startsAt: string;
  }) {
    const service = await this.prisma.service.findFirst({
      where: { id: input.serviceId, tenantId: input.tenantId, deletedAt: null },
    });
    if (!service) {
      throw new NotFoundException('Service not found');
    }
    const tenant = await this.prisma.tenant.findUnique({ where: { id: input.tenantId } });
    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }

    let staffUserId: string | null = null;
    let restaurantAreaId: string | null = null;

    if (tenant.vertical === VerticalType.RESTAURANT) {
      const area = await this.prisma.restaurantArea.findFirst({
        where: {
          id: input.staffUserId,
          tenantId: input.tenantId,
          branchId: input.branchId,
          isActive: true,
        },
      });
      if (!area) {
        throw new BadRequestException('Restaurant area not found for this branch');
      }
      restaurantAreaId = area.id;
    } else {
      const staff = await this.prisma.user.findFirst({
        where: {
          id: input.staffUserId,
          tenantId: input.tenantId,
          branchId: input.branchId,
          isStaff: true,
          deletedAt: null,
        },
      });
      if (!staff) {
        throw new BadRequestException('Staff member not found for this branch');
      }
      staffUserId = staff.id;
    }

    const customer = await this.prisma.customer.create({
      data: {
        tenantId: input.tenantId,
        fullName: input.customerName,
        phone: input.customerPhone,
        email: input.customerEmail?.trim().toLowerCase() || undefined,
      },
    });
    const startsAt = new Date(input.startsAt);
    const endsAt = new Date(startsAt.getTime() + service.durationMin * 60 * 1000);
    let createdByUserId = input.createdByUserId;
    if (!createdByUserId && input.createdByEmail) {
      const actor = await this.prisma.user.findFirst({
        where: { tenantId: input.tenantId, email: input.createdByEmail, deletedAt: null },
      });
      createdByUserId = actor?.id;
    }
    if (!createdByUserId) {
      createdByUserId = await this.resolveGuestActorUserId(input.tenantId);
    }

    const reservation = await this.prisma.appointment.create({
      data: {
        tenantId: input.tenantId,
        branchId: input.branchId,
        customerId: customer.id,
        serviceId: input.serviceId,
        staffUserId,
        restaurantAreaId,
        createdByUserId,
        startsAt,
        endsAt,
        status: AppointmentStatus.PENDING,
      },
    });

    await this.prisma.auditLog.create({
      data: {
        tenantId: input.tenantId,
        actorUserId: createdByUserId,
        entityType: 'NOTIFICATION',
        entityId: reservation.id,
        action: 'GUEST_RESERVATION_CREATED',
        metadata: {
          staffUserId,
          restaurantAreaId,
          customerName: input.customerName,
          startsAt: reservation.startsAt,
        },
      },
    });
    await this.prisma.auditLog.create({
      data: {
        tenantId: input.tenantId,
        actorUserId: createdByUserId,
        entityType: 'CUSTOMER_NOTIFICATION',
        entityId: reservation.id,
        action: 'GUEST_RESERVATION_CREATED',
        metadata: {
          appointmentId: reservation.id,
          customerPhone: input.customerPhone,
          customerEmail: input.customerEmail?.trim().toLowerCase() || undefined,
          customerName: input.customerName,
          startsAt: reservation.startsAt,
          staffUserId,
          restaurantAreaId,
        },
      },
    });
    return reservation;
  }

  async getGuestAvailability(input: { tenantId: string; branchId: string; serviceId: string; date: string; staffUserId?: string }) {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: input.tenantId } });
    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }
    if (tenant.vertical === VerticalType.RESTAURANT) {
      return this.getGuestAvailabilityRestaurant(input);
    }
    return this.getGuestAvailabilityStaff(input);
  }

  /** Güzellik / sağlık: personel vardiyasına göre slot */
  private async getGuestAvailabilityStaff(input: { tenantId: string; branchId: string; serviceId: string; date: string; staffUserId?: string }) {
    const service = await this.prisma.service.findFirst({
      where: { id: input.serviceId, tenantId: input.tenantId, branchId: input.branchId, deletedAt: null },
    });
    if (!service) {
      throw new NotFoundException('Service not found');
    }
    const dayStart = new Date(`${input.date}T00:00:00.000Z`);
    const dayEnd = new Date(`${input.date}T23:59:59.999Z`);

    let staff = await this.prisma.user.findMany({
      where: { tenantId: input.tenantId, branchId: input.branchId, isStaff: true, deletedAt: null },
      select: { id: true, fullName: true },
      orderBy: { fullName: 'asc' },
    });
    if (input.staffUserId) {
      staff = staff.filter((s) => s.id === input.staffUserId);
    }
    if (staff.length === 0) return [];

    const appointments = await this.prisma.appointment.findMany({
      where: {
        tenantId: input.tenantId,
        branchId: input.branchId,
        staffUserId: { in: staff.map((s) => s.id) },
        startsAt: { gte: dayStart, lte: dayEnd },
        status: { in: [AppointmentStatus.PENDING, AppointmentStatus.CONFIRMED, AppointmentStatus.IN_PROGRESS] },
      },
      select: { staffUserId: true, startsAt: true, endsAt: true },
    });

    const schedules = await this.prisma.schedule.findMany({
      where: {
        tenantId: input.tenantId,
        branchId: input.branchId,
        staffUserId: { in: staff.map((s) => s.id) },
        startsAt: { gte: dayStart, lte: dayEnd },
      },
      orderBy: { startsAt: 'asc' },
    });
    const schedulesByStaff = schedules.reduce<Record<string, Array<{ startsAt: Date; endsAt: Date }>>>((acc, row) => {
      if (!acc[row.staffUserId]) acc[row.staffUserId] = [];
      acc[row.staffUserId].push({ startsAt: row.startsAt, endsAt: row.endsAt });
      return acc;
    }, {});

    const slotStepMin = 30;
    const slots: Array<{ staffUserId: string; staffName: string; startsAt: string; endsAt: string }> = [];
    for (const worker of staff) {
      const windows = schedulesByStaff[worker.id] ?? [];
      for (const window of windows) {
        for (let cursor = new Date(window.startsAt); cursor < window.endsAt; cursor = new Date(cursor.getTime() + slotStepMin * 60 * 1000)) {
          const startsAt = new Date(cursor);
          const endsAt = new Date(startsAt.getTime() + service.durationMin * 60 * 1000);
          if (endsAt > window.endsAt) continue;
          const hasConflict = appointments.some((a) => a.staffUserId === worker.id && startsAt < a.endsAt && endsAt > a.startsAt);
          if (!hasConflict) {
            slots.push({
              staffUserId: worker.id,
              staffName: worker.fullName,
              startsAt: startsAt.toISOString(),
              endsAt: endsAt.toISOString(),
            });
          }
        }
      }
    }
    return slots.slice(0, 50);
  }

  /** Restoran: alan (bahçe, teras…) açılış saatlerine göre slot; staffUserId = area.id (API uyumu) */
  private async getGuestAvailabilityRestaurant(input: { tenantId: string; branchId: string; serviceId: string; date: string; staffUserId?: string }) {
    const service = await this.prisma.service.findFirst({
      where: { id: input.serviceId, tenantId: input.tenantId, branchId: input.branchId, deletedAt: null },
    });
    if (!service) {
      throw new NotFoundException('Service not found');
    }
    const dayStart = new Date(`${input.date}T00:00:00.000Z`);
    const dayEnd = new Date(`${input.date}T23:59:59.999Z`);

    let areas = await this.prisma.restaurantArea.findMany({
      where: { tenantId: input.tenantId, branchId: input.branchId, isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
    if (input.staffUserId) {
      areas = areas.filter((a) => a.id === input.staffUserId);
    }
    if (areas.length === 0) return [];

    const areaIds = areas.map((a) => a.id);

    const appointments = await this.prisma.appointment.findMany({
      where: {
        tenantId: input.tenantId,
        branchId: input.branchId,
        restaurantAreaId: { in: areaIds },
        startsAt: { gte: dayStart, lte: dayEnd },
        status: { in: [AppointmentStatus.PENDING, AppointmentStatus.CONFIRMED, AppointmentStatus.IN_PROGRESS] },
      },
      select: { restaurantAreaId: true, startsAt: true, endsAt: true },
    });

    const schedules = await this.prisma.restaurantAreaSchedule.findMany({
      where: {
        tenantId: input.tenantId,
        branchId: input.branchId,
        restaurantAreaId: { in: areaIds },
        startsAt: { gte: dayStart, lte: dayEnd },
      },
      orderBy: { startsAt: 'asc' },
    });
    const schedulesByArea = schedules.reduce<Record<string, Array<{ startsAt: Date; endsAt: Date }>>>((acc, row) => {
      if (!acc[row.restaurantAreaId]) acc[row.restaurantAreaId] = [];
      acc[row.restaurantAreaId].push({ startsAt: row.startsAt, endsAt: row.endsAt });
      return acc;
    }, {});

    const slotStepMin = 30;
    const slots: Array<{ staffUserId: string; staffName: string; startsAt: string; endsAt: string }> = [];
    for (const area of areas) {
      const label = area.revenueLabel ? `${area.name} (${area.revenueLabel})` : area.name;
      const windows = schedulesByArea[area.id] ?? [];
      for (const window of windows) {
        for (let cursor = new Date(window.startsAt); cursor < window.endsAt; cursor = new Date(cursor.getTime() + slotStepMin * 60 * 1000)) {
          const startsAt = new Date(cursor);
          const endsAt = new Date(startsAt.getTime() + service.durationMin * 60 * 1000);
          if (endsAt > window.endsAt) continue;
          const hasConflict = appointments.some(
            (a) => a.restaurantAreaId === area.id && startsAt < a.endsAt && endsAt > a.startsAt,
          );
          if (!hasConflict) {
            slots.push({
              staffUserId: area.id,
              staffName: label,
              startsAt: startsAt.toISOString(),
              endsAt: endsAt.toISOString(),
            });
          }
        }
      }
    }
    return slots.slice(0, 80);
  }

  async getStaffDayCalendar(input: { tenantId: string; branchId: string; date: string; serviceId?: string }) {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: input.tenantId } });
    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }
    if (tenant.vertical === VerticalType.RESTAURANT) {
      return this.getRestaurantAreaDayCalendar(input);
    }
    return this.getStaffDayCalendarInternal(input);
  }

  private async getStaffDayCalendarInternal(input: { tenantId: string; branchId: string; date: string; serviceId?: string }) {
    const dayStart = new Date(`${input.date}T00:00:00.000Z`);
    const dayEnd = new Date(`${input.date}T23:59:59.999Z`);
    const serviceDurationMin = input.serviceId
      ? (await this.prisma.service.findFirst({
          where: { id: input.serviceId, tenantId: input.tenantId, branchId: input.branchId, deletedAt: null },
          select: { durationMin: true },
        }))?.durationMin ?? 30
      : 30;
    const staff = await this.prisma.user.findMany({
      where: { tenantId: input.tenantId, branchId: input.branchId, isStaff: true, deletedAt: null },
      select: { id: true, fullName: true },
      orderBy: { fullName: 'asc' },
    });
    const schedules = await this.prisma.schedule.findMany({
      where: {
        tenantId: input.tenantId,
        branchId: input.branchId,
        staffUserId: { in: staff.map((s) => s.id) },
        startsAt: { gte: dayStart, lte: dayEnd },
      },
      orderBy: { startsAt: 'asc' },
    });
    const appointments = await this.prisma.appointment.findMany({
      where: {
        tenantId: input.tenantId,
        branchId: input.branchId,
        staffUserId: { in: staff.map((s) => s.id) },
        startsAt: { gte: dayStart, lte: dayEnd },
        status: { in: [AppointmentStatus.PENDING, AppointmentStatus.CONFIRMED, AppointmentStatus.IN_PROGRESS] },
      },
      select: { id: true, staffUserId: true, startsAt: true, endsAt: true, status: true },
      orderBy: { startsAt: 'asc' },
    });
    const schedulesByStaff = schedules.reduce<Record<string, Array<{ startsAt: Date; endsAt: Date }>>>((acc, row) => {
      if (!acc[row.staffUserId]) acc[row.staffUserId] = [];
      acc[row.staffUserId].push({ startsAt: row.startsAt, endsAt: row.endsAt });
      return acc;
    }, {});
    const appointmentCountByStaff = appointments.reduce<Record<string, number>>((acc, row) => {
      acc[row.staffUserId!] = (acc[row.staffUserId!] ?? 0) + 1;
      return acc;
    }, {});
    return staff.map((worker) => {
      const windows = schedulesByStaff[worker.id] ?? [];
      const totalWorkMin = windows.reduce((sum, w) => sum + (w.endsAt.getTime() - w.startsAt.getTime()) / 60000, 0);
      const offDay = windows.length === 0;
      const capacitySlots = Math.floor(totalWorkMin / serviceDurationMin);
      const booked = appointmentCountByStaff[worker.id] ?? 0;
      return {
        staffUserId: worker.id,
        staffName: worker.fullName,
        offDay,
        shifts: windows.map((w) => ({ startsAt: w.startsAt.toISOString(), endsAt: w.endsAt.toISOString() })),
        bookedCount: booked,
        freeCount: Math.max(capacitySlots - booked, 0),
      };
    });
  }

  /** Takvim satırı: staffUserId = alan id, staffName = görünen ad (UI uyumu) */
  private async getRestaurantAreaDayCalendar(input: { tenantId: string; branchId: string; date: string; serviceId?: string }) {
    const dayStart = new Date(`${input.date}T00:00:00.000Z`);
    const dayEnd = new Date(`${input.date}T23:59:59.999Z`);
    const serviceDurationMin = input.serviceId
      ? (await this.prisma.service.findFirst({
          where: { id: input.serviceId, tenantId: input.tenantId, branchId: input.branchId, deletedAt: null },
          select: { durationMin: true },
        }))?.durationMin ?? 90
      : 90;

    const areas = await this.prisma.restaurantArea.findMany({
      where: { tenantId: input.tenantId, branchId: input.branchId, isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });

    const schedules = await this.prisma.restaurantAreaSchedule.findMany({
      where: {
        tenantId: input.tenantId,
        branchId: input.branchId,
        restaurantAreaId: { in: areas.map((a) => a.id) },
        startsAt: { gte: dayStart, lte: dayEnd },
      },
      orderBy: { startsAt: 'asc' },
    });
    const appointments = await this.prisma.appointment.findMany({
      where: {
        tenantId: input.tenantId,
        branchId: input.branchId,
        restaurantAreaId: { in: areas.map((a) => a.id) },
        startsAt: { gte: dayStart, lte: dayEnd },
        status: { in: [AppointmentStatus.PENDING, AppointmentStatus.CONFIRMED, AppointmentStatus.IN_PROGRESS] },
      },
      select: { id: true, restaurantAreaId: true, startsAt: true, endsAt: true, status: true },
      orderBy: { startsAt: 'asc' },
    });

    const schedulesByArea = schedules.reduce<Record<string, Array<{ startsAt: Date; endsAt: Date }>>>((acc, row) => {
      if (!acc[row.restaurantAreaId]) acc[row.restaurantAreaId] = [];
      acc[row.restaurantAreaId].push({ startsAt: row.startsAt, endsAt: row.endsAt });
      return acc;
    }, {});

    const appointmentCountByArea = appointments.reduce<Record<string, number>>((acc, row) => {
      const id = row.restaurantAreaId!;
      acc[id] = (acc[id] ?? 0) + 1;
      return acc;
    }, {});

    return areas.map((area) => {
      const windows = schedulesByArea[area.id] ?? [];
      const totalWorkMin = windows.reduce((sum, w) => sum + (w.endsAt.getTime() - w.startsAt.getTime()) / 60000, 0);
      const offDay = windows.length === 0;
      const capacitySlots = Math.floor(totalWorkMin / serviceDurationMin);
      const booked = appointmentCountByArea[area.id] ?? 0;
      const label = area.revenueLabel ? `${area.name} (${area.revenueLabel})` : area.name;
      return {
        staffUserId: area.id,
        staffName: label,
        offDay,
        shifts: windows.map((w) => ({ startsAt: w.startsAt.toISOString(), endsAt: w.endsAt.toISOString() })),
        bookedCount: booked,
        freeCount: Math.max(capacitySlots - booked, 0),
      };
    });
  }

  /** Misafir: seçilen tarih için özel gün fiyatı özeti */
  async getGuestPricingHint(input: { tenantId: string; branchId: string; date: string }) {
    const branch = await this.prisma.branch.findFirst({
      where: { id: input.branchId, tenantId: input.tenantId, deletedAt: null },
    });
    if (!branch) {
      throw new NotFoundException('Branch not found');
    }
    const day = new Date(`${input.date}T12:00:00.000Z`);
    const rule = await this.prisma.branchPricingDay.findFirst({
      where: { branchId: input.branchId, tenantId: input.tenantId, date: day, isActive: true },
    });
    if (!rule) {
      return { hasRule: false as const };
    }
    return {
      hasRule: true as const,
      label: rule.label,
      surchargePercent: rule.surchargePercent != null ? Number(rule.surchargePercent) : null,
      extraAmount: rule.extraAmount != null ? Number(rule.extraAmount) : null,
      note: rule.note,
    };
  }

  async listRestaurantAreas(tenantId: string, branchId: string) {
    return this.prisma.restaurantArea.findMany({
      where: { tenantId, branchId, isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  async upsertBranchPricingDay(input: {
    tenantId: string;
    branchId: string;
    dateYmd: string;
    label?: string;
    surchargePercent?: number | null;
    extraAmount?: number | null;
    note?: string | null;
    isActive?: boolean;
  }) {
    const branch = await this.prisma.branch.findFirst({
      where: { id: input.branchId, tenantId: input.tenantId, deletedAt: null },
    });
    if (!branch) {
      throw new NotFoundException('Branch not found');
    }
    const day = new Date(`${input.dateYmd}T12:00:00.000Z`);
    return this.prisma.branchPricingDay.upsert({
      where: { branchId_date: { branchId: input.branchId, date: day } },
      create: {
        tenantId: input.tenantId,
        branchId: input.branchId,
        date: day,
        label: input.label,
        surchargePercent: input.surchargePercent != null ? new Prisma.Decimal(input.surchargePercent) : null,
        extraAmount: input.extraAmount != null ? new Prisma.Decimal(input.extraAmount) : null,
        note: input.note ?? undefined,
        isActive: input.isActive ?? true,
      },
      update: {
        label: input.label,
        surchargePercent: input.surchargePercent != null ? new Prisma.Decimal(input.surchargePercent) : null,
        extraAmount: input.extraAmount != null ? new Prisma.Decimal(input.extraAmount) : null,
        note: input.note ?? undefined,
        isActive: input.isActive ?? true,
      },
    });
  }

  /** İşletme: şubedeki önemli gün fiyat kuralları (geçmiş + gelecek) */
  async listBranchPricingDays(input: { tenantId: string; branchId: string; limit?: number }) {
    const branch = await this.prisma.branch.findFirst({
      where: { id: input.branchId, tenantId: input.tenantId, deletedAt: null },
    });
    if (!branch) {
      throw new NotFoundException('Branch not found');
    }
    const rows = await this.prisma.branchPricingDay.findMany({
      where: { tenantId: input.tenantId, branchId: input.branchId },
      orderBy: { date: 'asc' },
      take: input.limit ?? 180,
    });
    return rows.map((r) => ({
      id: r.id,
      date: r.date.toISOString().slice(0, 10),
      label: r.label,
      surchargePercent: r.surchargePercent != null ? Number(r.surchargePercent) : null,
      extraAmount: r.extraAmount != null ? Number(r.extraAmount) : null,
      note: r.note,
      isActive: r.isActive,
    }));
  }

  async changeStatus(input: {
    tenantId: string;
    appointmentId: string;
    changedByUserId?: string;
    changedByEmail?: string;
    toStatus: AppointmentStatus;
    reason?: string;
  }) {
    const appointment = await this.prisma.appointment.findFirst({
      where: { id: input.appointmentId, tenantId: input.tenantId },
      include: { service: true, customer: { select: { phone: true, email: true, fullName: true } } },
    });
    if (!appointment) {
      throw new NotFoundException('Appointment not found');
    }
    const valid =
      (appointment.status === AppointmentStatus.PENDING && input.toStatus === AppointmentStatus.CONFIRMED) ||
      (appointment.status === AppointmentStatus.CONFIRMED && input.toStatus === AppointmentStatus.IN_PROGRESS) ||
      (appointment.status === AppointmentStatus.IN_PROGRESS && input.toStatus === AppointmentStatus.COMPLETED);
    if (!valid) {
      throw new BadRequestException(`Invalid transition ${appointment.status} -> ${input.toStatus}`);
    }

    let changedByUserId = input.changedByUserId;
    if (!changedByUserId && input.changedByEmail) {
      const actor = await this.prisma.user.findFirst({
        where: { tenantId: input.tenantId, email: input.changedByEmail, deletedAt: null },
      });
      changedByUserId = actor?.id;
    }
    if (!changedByUserId) {
      throw new BadRequestException('Missing actor identity');
    }

    const updated = await this.prisma.appointment.update({
      where: { id: appointment.id },
      data: { status: input.toStatus },
    });
    await this.prisma.appointmentStatusHistory.create({
      data: {
        tenantId: input.tenantId,
        appointmentId: appointment.id,
        changedByUserId,
        fromStatus: appointment.status,
        toStatus: input.toStatus,
        reason: input.reason,
      },
    });

    if (input.toStatus === AppointmentStatus.COMPLETED) {
      const tenant = await this.prisma.tenant.findUniqueOrThrow({ where: { id: input.tenantId } });
      const { amount, currency } = await this.resolveCompletedIncomeAmount(
        input.tenantId,
        appointment.branchId,
        appointment.serviceId,
        appointment.startsAt,
      );
      await this.prisma.ledgerEntry.create({
        data: {
          tenantId: input.tenantId,
          appointmentId: appointment.id,
          type: 'INCOME',
          amount,
          currency,
          description: `Appointment completed: ${appointment.id}`,
        },
      });
    }
    await this.prisma.auditLog.create({
      data: {
        tenantId: input.tenantId,
        actorUserId: changedByUserId,
        entityType: 'NOTIFICATION',
        entityId: appointment.id,
        action: `APPOINTMENT_${input.toStatus}`,
        metadata: {
          appointmentId: appointment.id,
          staffUserId: appointment.staffUserId,
          restaurantAreaId: appointment.restaurantAreaId,
          toStatus: input.toStatus,
        },
      },
    });
    await this.prisma.auditLog.create({
      data: {
        tenantId: input.tenantId,
        actorUserId: changedByUserId,
        entityType: 'CUSTOMER_NOTIFICATION',
        entityId: appointment.id,
        action: `APPOINTMENT_${input.toStatus}`,
        metadata: {
          appointmentId: appointment.id,
          customerPhone: appointment.customer.phone,
          customerEmail: appointment.customer.email?.toLowerCase(),
          customerName: appointment.customer.fullName,
          toStatus: input.toStatus,
          staffUserId: appointment.staffUserId,
          restaurantAreaId: appointment.restaurantAreaId,
        },
      },
    });
    return updated;
  }

  async cancelReservation(input: {
    tenantId: string;
    appointmentId: string;
    changedByUserId?: string;
    changedByEmail?: string;
    reason?: string;
  }) {
    const appointment = await this.prisma.appointment.findFirst({
      where: { id: input.appointmentId, tenantId: input.tenantId },
      include: { customer: { select: { phone: true, email: true, fullName: true } } },
    });
    if (!appointment) {
      throw new NotFoundException('Appointment not found');
    }
    if (
      appointment.status !== AppointmentStatus.PENDING &&
      appointment.status !== AppointmentStatus.CONFIRMED
    ) {
      throw new BadRequestException('Only PENDING or CONFIRMED appointments can be cancelled');
    }
    let changedByUserId = input.changedByUserId;
    if (!changedByUserId && input.changedByEmail) {
      const actor = await this.prisma.user.findFirst({
        where: { tenantId: input.tenantId, email: input.changedByEmail, deletedAt: null },
      });
      changedByUserId = actor?.id;
    }
    if (!changedByUserId) {
      changedByUserId = await this.resolveGuestActorUserId(input.tenantId);
    }
    const updated = await this.prisma.appointment.update({
      where: { id: appointment.id },
      data: { status: AppointmentStatus.CANCELLED, cancelledAt: new Date() },
    });
    await this.prisma.appointmentStatusHistory.create({
      data: {
        tenantId: input.tenantId,
        appointmentId: appointment.id,
        changedByUserId,
        fromStatus: appointment.status,
        toStatus: AppointmentStatus.CANCELLED,
        reason: input.reason,
      },
    });
    await this.prisma.auditLog.create({
      data: {
        tenantId: input.tenantId,
        actorUserId: changedByUserId,
        entityType: 'NOTIFICATION',
        entityId: appointment.id,
        action: 'APPOINTMENT_CANCELLED',
        metadata: { appointmentId: appointment.id },
      },
    });
    return updated;
  }

  async getCustomerNotifications(input: { tenantId: string; phone?: string; email?: string }) {
    const phone = input.phone?.trim();
    const email = input.email?.trim().toLowerCase();
    if (!phone && !email) {
      throw new BadRequestException('phone or email required');
    }
    const or: Array<Record<string, unknown>> = [];
    if (phone) {
      or.push({ metadata: { path: ['customerPhone'], equals: phone } });
    }
    if (email) {
      or.push({ metadata: { path: ['customerEmail'], equals: email } });
    }
    return this.prisma.auditLog.findMany({
      where: {
        tenantId: input.tenantId,
        entityType: 'CUSTOMER_NOTIFICATION',
        OR: or,
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  async getStaffNotifications(input: { tenantId: string; staffUserId: string }) {
    return this.prisma.auditLog.findMany({
      where: {
        tenantId: input.tenantId,
        entityType: 'NOTIFICATION',
        metadata: { path: ['staffUserId'], equals: input.staffUserId },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  async listReservations(tenantId: string, status?: AppointmentStatus) {
    return this.prisma.appointment.findMany({
      where: {
        tenantId,
        ...(status ? { status } : {}),
      },
      orderBy: { startsAt: 'desc' },
      take: 200,
      include: {
        customer: { select: { fullName: true, phone: true } },
        service: { select: { name: true, priceAmount: true, currency: true } },
        staffUser: { select: { fullName: true } },
        restaurantArea: { select: { name: true, code: true, revenueLabel: true } },
        branch: { select: { name: true } },
      },
    });
  }
}
