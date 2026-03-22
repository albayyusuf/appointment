import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UserStatus, VerticalType } from '@prisma/client';

type BootstrapTenantInput = {
  name: string;
  slug: string;
  vertical: VerticalType;
  defaultCurrency: string;
};
type CreateRoleInput = {
  tenantId: string;
  code: string;
  name: string;
  description?: string;
};

@Injectable()
export class TenantService {
  constructor(private readonly prisma: PrismaService) {}

  async getCurrentTenant(tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
    });
    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }
    return tenant;
  }

  async bootstrapTenant(input: BootstrapTenantInput) {
    return this.prisma.tenant.create({
      data: {
        name: input.name,
        slug: input.slug,
        vertical: input.vertical,
        defaultCurrency: input.defaultCurrency,
      },
    });
  }

  setDefaultCurrency(tenantId: string, currency: string) {
    return this.prisma.tenant.update({
      where: { id: tenantId },
      data: { defaultCurrency: currency.toUpperCase() },
    });
  }

  listRoles(tenantId: string) {
    return this.prisma.role.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
    });
  }

  createRole(input: CreateRoleInput) {
    return this.prisma.role.upsert({
      where: {
        tenantId_code: {
          tenantId: input.tenantId,
          code: input.code.toUpperCase(),
        },
      },
      update: {
        name: input.name,
        description: input.description,
      },
      create: {
        tenantId: input.tenantId,
        code: input.code.toUpperCase(),
        name: input.name,
        description: input.description,
      },
    });
  }

  listUsers(tenantId: string) {
    return this.prisma.user.findMany({
      where: { tenantId, deletedAt: null },
      include: {
        branch: { select: { id: true, name: true, code: true } },
        staffProfile: true,
        userRoles: { include: { role: { select: { id: true, code: true, name: true } } } },
      },
      orderBy: [{ isStaff: 'desc' }, { fullName: 'asc' }],
    });
  }

  async createUser(
    tenantId: string,
    body: {
      email: string;
      fullName: string;
      branchId?: string | null;
      isStaff?: boolean;
      specialty?: string | null;
      roleCodes?: string[];
    },
  ) {
    const email = body.email.trim().toLowerCase();
    if (!email) {
      throw new BadRequestException('email required');
    }
    if (body.branchId) {
      const br = await this.prisma.branch.findFirst({
        where: { id: body.branchId, tenantId, deletedAt: null },
      });
      if (!br) {
        throw new BadRequestException('Invalid branch');
      }
    }
    const user = await this.prisma.user.create({
      data: {
        tenantId,
        email,
        fullName: body.fullName.trim(),
        branchId: body.branchId ?? undefined,
        isStaff: body.isStaff ?? false,
        status: UserStatus.ACTIVE,
        passwordHash: 'TEMP_SETUP_REQUIRED',
      },
    });
    if (body.isStaff) {
      await this.prisma.staffProfile.upsert({
        where: { userId: user.id },
        update: { specialty: body.specialty ?? undefined },
        create: {
          tenantId,
          userId: user.id,
          specialty: body.specialty ?? 'General',
        },
      });
    }
    const rawCodes = body.roleCodes?.length ? body.roleCodes : body.isStaff ? ['STAFF'] : ['ADMIN'];
    const codes = [...new Set(rawCodes.map((c) => c.toUpperCase()))];
    for (const code of codes) {
      const role = await this.prisma.role.findFirst({ where: { tenantId, code: code } });
      if (role) {
        await this.prisma.userRole.upsert({
          where: {
            tenantId_userId_roleId: { tenantId, userId: user.id, roleId: role.id },
          },
          update: {},
          create: { tenantId, userId: user.id, roleId: role.id },
        });
      }
    }
    return this.prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      include: {
        branch: { select: { id: true, name: true, code: true } },
        staffProfile: true,
        userRoles: { include: { role: true } },
      },
    });
  }

  async updateUser(
    tenantId: string,
    userId: string,
    body: Partial<{
      fullName: string;
      email: string;
      branchId: string | null;
      isStaff: boolean;
      status: UserStatus;
      specialty: string | null;
    }>,
  ) {
    const existing = await this.prisma.user.findFirst({
      where: { id: userId, tenantId, deletedAt: null },
    });
    if (!existing) {
      throw new NotFoundException('User not found');
    }
    if (body.branchId) {
      const br = await this.prisma.branch.findFirst({
        where: { id: body.branchId, tenantId, deletedAt: null },
      });
      if (!br) {
        throw new BadRequestException('Invalid branch');
      }
    }
    const email = body.email?.trim().toLowerCase();
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(body.fullName !== undefined ? { fullName: body.fullName.trim() } : {}),
        ...(email !== undefined ? { email } : {}),
        ...(body.branchId !== undefined ? { branchId: body.branchId } : {}),
        ...(body.isStaff !== undefined ? { isStaff: body.isStaff } : {}),
        ...(body.status !== undefined ? { status: body.status } : {}),
      },
    });
    if (body.isStaff === true || (body.specialty !== undefined && existing.isStaff)) {
      await this.prisma.staffProfile.upsert({
        where: { userId },
        update: { specialty: body.specialty ?? undefined },
        create: {
          tenantId,
          userId,
          specialty: body.specialty ?? 'General',
        },
      });
    }
    if (body.isStaff === false) {
      await this.prisma.staffProfile.deleteMany({ where: { userId } });
    }
    return this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: {
        branch: { select: { id: true, name: true, code: true } },
        staffProfile: true,
        userRoles: { include: { role: true } },
      },
    });
  }

  async deleteUser(tenantId: string, userId: string) {
    const existing = await this.prisma.user.findFirst({
      where: { id: userId, tenantId, deletedAt: null },
    });
    if (!existing) {
      throw new NotFoundException('User not found');
    }
    await this.prisma.user.update({
      where: { id: userId },
      data: { deletedAt: new Date(), status: UserStatus.SUSPENDED },
    });
    return { ok: true as const };
  }
}
