import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AccountingService {
  constructor(private readonly prisma: PrismaService) {}

  listLedger(tenantId: string, type?: string) {
    return this.prisma.ledgerEntry.findMany({
      where: {
        tenantId,
        ...(type ? { type } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }

  async createCashEntry(input: { tenantId: string; amount: number; currency: string; description?: string }) {
    return this.prisma.ledgerEntry.create({
      data: {
        tenantId: input.tenantId,
        type: 'CASH_IN',
        amount: input.amount,
        currency: input.currency,
        description: input.description ?? 'Manual cash register entry',
      },
    });
  }
}
