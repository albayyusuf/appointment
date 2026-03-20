import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AppointmentStatus } from '@prisma/client';
import { ServiceCatalogService } from '../../service-catalog/service-catalog/service-catalog.service';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class AppointmentService {
  constructor(
    private readonly serviceCatalog: ServiceCatalogService,
    private readonly prisma: PrismaService,
  ) {}

  async onServiceUpdated(tenantId: string, branchId: string): Promise<void> {
    await this.serviceCatalog.invalidateBranchServices(tenantId, branchId);
  }

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
      throw new BadRequestException('Missing creator identity');
    }

    const reservation = await this.prisma.appointment.create({
      data: {
        tenantId: input.tenantId,
        branchId: input.branchId,
        customerId: customer.id,
        serviceId: input.serviceId,
        staffUserId: input.staffUserId,
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
          staffUserId: input.staffUserId,
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
          staffUserId: input.staffUserId,
        },
      },
    });
    return reservation;
  }

  async getGuestAvailability(input: { tenantId: string; branchId: string; serviceId: string; date: string; staffUserId?: string }) {
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

  async getStaffDayCalendar(input: { tenantId: string; branchId: string; date: string; serviceId?: string }) {
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
      acc[row.staffUserId] = (acc[row.staffUserId] ?? 0) + 1;
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
      await this.prisma.ledgerEntry.create({
        data: {
          tenantId: input.tenantId,
          appointmentId: appointment.id,
          type: 'INCOME',
          amount: appointment.service.priceAmount,
          currency: appointment.service.currency || tenant.defaultCurrency,
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
        },
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
        branch: { select: { name: true } },
      },
    });
  }
}
