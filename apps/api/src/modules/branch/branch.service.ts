import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class BranchService {
  constructor(private readonly prisma: PrismaService) {}

  listByTenant(tenantId: string) {
    /** Prisma undefined alanı where'den düşürür; yanlışlıkla tüm şubeler dönmesin */
    if (!tenantId || !String(tenantId).trim()) {
      throw new BadRequestException('Missing tenant for branch list');
    }
    return this.prisma.branch.findMany({
      where: { tenantId, deletedAt: null },
      /** Ana şube (genelde ilk oluşturulan HQ) listenin başında olsun */
      orderBy: [{ createdAt: 'asc' }],
    });
  }

  async createBranch(
    tenantId: string,
    body: { name: string; code: string; phone?: string; addressLine?: string; city?: string; country?: string; parentBranchId?: string | null },
  ) {
    const code = body.code.toUpperCase().replace(/[^A-Z0-9_-]/g, '');
    try {
      return await this.prisma.branch.create({
        data: {
          tenantId,
          name: body.name,
          code,
          phone: body.phone,
          addressLine: body.addressLine,
          city: body.city,
          country: body.country ?? 'TR',
          parentBranchId: body.parentBranchId ?? undefined,
        },
      });
    } catch (e: unknown) {
      if (e && typeof e === 'object' && 'code' in e && (e as { code: string }).code === 'P2002') {
        throw new ConflictException('Branch code already exists for this tenant');
      }
      throw e;
    }
  }

  async updateBranch(
    tenantId: string,
    branchId: string,
    body: Partial<{
      name: string;
      code: string;
      phone: string | null;
      addressLine: string | null;
      city: string | null;
      country: string | null;
      isActive: boolean;
      parentBranchId: string | null;
    }>,
  ) {
    const existing = await this.prisma.branch.findFirst({
      where: { id: branchId, tenantId, deletedAt: null },
    });
    if (!existing) {
      throw new NotFoundException('Branch not found');
    }
    const code = body.code !== undefined ? body.code.toUpperCase().replace(/[^A-Z0-9_-]/g, '') : undefined;
    try {
      return await this.prisma.branch.update({
        where: { id: branchId },
        data: {
          ...(body.name !== undefined ? { name: body.name } : {}),
          ...(code !== undefined ? { code } : {}),
          ...(body.phone !== undefined ? { phone: body.phone } : {}),
          ...(body.addressLine !== undefined ? { addressLine: body.addressLine } : {}),
          ...(body.city !== undefined ? { city: body.city } : {}),
          ...(body.country !== undefined ? { country: body.country } : {}),
          ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
          ...(body.parentBranchId !== undefined ? { parentBranchId: body.parentBranchId } : {}),
        },
      });
    } catch (e: unknown) {
      if (e && typeof e === 'object' && 'code' in e && (e as { code: string }).code === 'P2002') {
        throw new ConflictException('Branch code already exists for this tenant');
      }
      throw e;
    }
  }

  async deleteBranch(tenantId: string, branchId: string) {
    const existing = await this.prisma.branch.findFirst({
      where: { id: branchId, tenantId, deletedAt: null },
    });
    if (!existing) {
      throw new NotFoundException('Branch not found');
    }
    await this.prisma.branch.update({
      where: { id: branchId },
      data: { deletedAt: new Date(), isActive: false },
    });
    return { ok: true as const };
  }
}
