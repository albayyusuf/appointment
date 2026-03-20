import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { VerticalType } from '@prisma/client';

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
}
