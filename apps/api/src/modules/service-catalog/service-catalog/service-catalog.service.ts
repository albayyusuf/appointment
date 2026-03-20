import { Inject, Injectable } from '@nestjs/common';
import { CACHE_PORT } from '../../cache/cache.port';
import type { CachePort } from '../../cache/cache.port';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class ServiceCatalogService {
  constructor(
    @Inject(CACHE_PORT) private readonly cache: CachePort,
    private readonly prisma: PrismaService,
  ) {}

  async getBranchServices(tenantId: string, branchId: string): Promise<unknown[]> {
    const key = `tenant:${tenantId}:branch:${branchId}:service-catalog`;
    const cached = await this.cache.get<unknown[]>(key);
    if (cached) {
      return cached;
    }

    const services = await this.prisma.service.findMany({
      where: { tenantId, branchId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    await this.cache.set(key, services, 60);
    return services;
  }

  async invalidateBranchServices(tenantId: string, branchId: string): Promise<void> {
    const key = `tenant:${tenantId}:branch:${branchId}:service-catalog`;
    await this.cache.del(key);
  }

  async createService(input: {
    tenantId: string;
    branchId: string;
    categoryName: string;
    name: string;
    durationMin: number;
    priceAmount: number;
    currency?: string;
  }) {
    const tenant = await this.prisma.tenant.findUniqueOrThrow({ where: { id: input.tenantId } });
    const branch = await this.prisma.branch.findFirstOrThrow({
      where: { id: input.branchId, tenantId: input.tenantId, deletedAt: null },
    });
    const category = await this.prisma.serviceCategory.upsert({
      where: {
        tenantId_name_vertical: {
          tenantId: input.tenantId,
          name: input.categoryName,
          vertical: tenant.vertical,
        },
      },
      update: {},
      create: {
        tenantId: input.tenantId,
        name: input.categoryName,
        vertical: tenant.vertical,
      },
    });
    const service = await this.prisma.service.create({
      data: {
        tenantId: input.tenantId,
        branchId: branch.id,
        categoryId: category.id,
        name: input.name,
        durationMin: input.durationMin,
        priceAmount: input.priceAmount,
        currency: input.currency ?? tenant.defaultCurrency,
      },
    });
    await this.invalidateBranchServices(input.tenantId, input.branchId);
    return service;
  }
}
