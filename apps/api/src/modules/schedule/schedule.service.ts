import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ScheduleService {
  constructor(private readonly prisma: PrismaService) {}

  list(input: { tenantId: string; branchId?: string; staffUserId?: string; from?: string; to?: string }) {
    const from = input.from ? new Date(input.from) : undefined;
    const to = input.to ? new Date(input.to) : undefined;
    return this.prisma.schedule.findMany({
      where: {
        tenantId: input.tenantId,
        ...(input.branchId ? { branchId: input.branchId } : {}),
        ...(input.staffUserId ? { staffUserId: input.staffUserId } : {}),
        ...(from && to ? { startsAt: { gte: from, lte: to } } : {}),
      },
      orderBy: { startsAt: 'asc' },
      include: {
        staffUser: { select: { id: true, fullName: true, email: true } },
        branch: { select: { id: true, name: true, code: true } },
      },
      take: 500,
    });
  }

  async create(input: {
    tenantId: string;
    branchId: string;
    staffUserId: string;
    startsAt: string;
    endsAt: string;
  }) {
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
      throw new BadRequestException('Staff user not found for this branch');
    }
    const branch = await this.prisma.branch.findFirst({
      where: { id: input.branchId, tenantId: input.tenantId, deletedAt: null },
    });
    if (!branch) {
      throw new BadRequestException('Branch not found');
    }
    const startsAt = new Date(input.startsAt);
    const endsAt = new Date(input.endsAt);
    if (!(startsAt < endsAt)) {
      throw new BadRequestException('Invalid time range');
    }
    return this.prisma.schedule.create({
      data: {
        tenantId: input.tenantId,
        branchId: input.branchId,
        staffUserId: input.staffUserId,
        startsAt,
        endsAt,
      },
      include: {
        staffUser: { select: { id: true, fullName: true } },
        branch: { select: { id: true, name: true, code: true } },
      },
    });
  }

  async delete(tenantId: string, scheduleId: string) {
    const row = await this.prisma.schedule.findFirst({
      where: { id: scheduleId, tenantId },
    });
    if (!row) {
      throw new NotFoundException('Schedule not found');
    }
    await this.prisma.schedule.delete({ where: { id: scheduleId } });
    return { ok: true as const };
  }
}
