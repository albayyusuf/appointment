import { Injectable, NotFoundException } from '@nestjs/common';
import { PaymentStatus, SubscriptionStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SaasService {
  constructor(private readonly prisma: PrismaService) {}

  listPlans() {
    return this.prisma.plan.findMany({
      where: { isActive: true },
      orderBy: { priceAmount: 'asc' },
    });
  }

  async subscribeTenant(tenantSlug: string, planCode: string) {
    const tenant = await this.prisma.tenant.findUnique({ where: { slug: tenantSlug } });
    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }

    const plan = await this.prisma.plan.findUnique({ where: { code: planCode } });
    if (!plan) {
      throw new NotFoundException('Plan not found');
    }

    return this.prisma.subscription.create({
      data: {
        tenantId: tenant.id,
        planId: plan.id,
        status: SubscriptionStatus.ACTIVE,
        trialEndsAt: null,
        nextBillingAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
      include: { plan: true, tenant: true },
    });
  }

  async mockPay(subscriptionId: string) {
    const subscription = await this.prisma.subscription.findUnique({
      where: { id: subscriptionId },
      include: { plan: true },
    });
    if (!subscription) {
      throw new NotFoundException('Subscription not found');
    }

    return this.prisma.payment.create({
      data: {
        subscriptionId,
        amount: subscription.plan.priceAmount,
        currency: subscription.plan.currency,
        status: PaymentStatus.PAID,
        provider: 'mock-gateway',
        providerRef: `MOCK-${Date.now()}`,
        paidAt: new Date(),
      },
    });
  }

  async platformOverview() {
    const [tenants, activeSubscriptions, monthlyRevenue, superAdmins] = await Promise.all([
      this.prisma.tenant.count(),
      this.prisma.subscription.count({ where: { status: SubscriptionStatus.ACTIVE } }),
      this.prisma.payment.aggregate({
        _sum: { amount: true },
        where: { status: PaymentStatus.PAID },
      }),
      this.prisma.platformUser.count({ where: { isSuperAdmin: true } }),
    ]);

    return {
      tenants,
      activeSubscriptions,
      totalPaidAmount: monthlyRevenue._sum.amount ?? 0,
      superAdmins,
    };
  }

  async tenantsSummary() {
    const tenants = await this.prisma.tenant.findMany({
      orderBy: { createdAt: 'desc' },
      take: 12,
      include: {
        subscriptions: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          include: { plan: true },
        },
        branches: {
          where: { deletedAt: null },
          select: { id: true },
        },
      },
    });

    return tenants.map((tenant) => ({
      id: tenant.id,
      name: tenant.name,
      slug: tenant.slug,
      vertical: tenant.vertical,
      branches: tenant.branches.length,
      subscriptionStatus: tenant.subscriptions[0]?.status ?? 'NONE',
      planName: tenant.subscriptions[0]?.plan.name ?? '-',
    }));
  }

  recentPayments() {
    return this.prisma.payment.findMany({
      orderBy: { createdAt: 'desc' },
      take: 20,
      include: {
        subscription: {
          include: {
            tenant: true,
            plan: true,
          },
        },
      },
    });
  }

  async checkoutContext(tenantSlug: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { slug: tenantSlug },
      include: {
        subscriptions: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          include: { plan: true },
        },
      },
    });
    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }
    const plans = await this.listPlans();
    return {
      tenant: { id: tenant.id, name: tenant.name, slug: tenant.slug, vertical: tenant.vertical },
      currentSubscription: tenant.subscriptions[0] ?? null,
      plans,
    };
  }
}
