import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { BillingInterval, PaymentStatus, Plan, Prisma, SubscriptionStatus, UserStatus, VerticalType } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import Stripe from 'stripe';
import { PrismaService } from '../prisma/prisma.service';

const BCRYPT_ROUNDS = 10;

export type CreatePlanInput = {
  code: string;
  name: string;
  description?: string;
  sortOrder?: number;
  badgeLabel?: string | null;
  stripePriceId?: string | null;
  stripeProductId?: string | null;
  featureLines?: unknown;
  priceAmount: number;
  currency?: string;
  interval: BillingInterval;
  trialDays?: number;
  maxBranches?: number;
  maxStaff?: number;
  maxAppointmentsMo?: number;
  isActive?: boolean;
};

export type UpdatePlanInput = Partial<CreatePlanInput>;

@Injectable()
export class SaasService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Checkout için Stripe Price ID: önce plan.stripePriceId, yoksa ürün altındaki
   * recurring fiyatlarından plan.interval ile eşleşen (ay/yıl) seçilir.
   */
  private async resolveStripePriceIdForCheckout(plan: Plan): Promise<string | null> {
    const direct = plan.stripePriceId?.trim();
    if (direct) {
      return direct;
    }
    const productId = plan.stripeProductId?.trim();
    const secret = process.env.STRIPE_SECRET_KEY;
    if (!secret || !productId) {
      return null;
    }
    try {
      const stripe = new Stripe(secret);
      const prices = await stripe.prices.list({
        product: productId,
        active: true,
        limit: 100,
      });
      const wantMonth = plan.interval === BillingInterval.MONTHLY;
      const wantYear = plan.interval === BillingInterval.YEARLY;
      for (const pr of prices.data) {
        if (pr.type !== 'recurring' || !pr.recurring) continue;
        if (wantMonth && pr.recurring.interval === 'month') return pr.id;
        if (wantYear && pr.recurring.interval === 'year') return pr.id;
      }
      const firstRec = prices.data.find((pr) => pr.type === 'recurring');
      return firstRec?.id ?? null;
    } catch {
      return null;
    }
  }

  private computeNextBilling(interval: BillingInterval, from: Date): Date {
    const d = new Date(from);
    if (interval === BillingInterval.YEARLY) {
      d.setFullYear(d.getFullYear() + 1);
    } else {
      d.setMonth(d.getMonth() + 1);
    }
    return d;
  }

  listPlans() {
    return this.prisma.plan.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { priceAmount: 'asc' }],
    });
  }

  listPlansAdmin() {
    return this.prisma.plan.findMany({
      orderBy: [{ sortOrder: 'asc' }, { priceAmount: 'asc' }],
    });
  }

  async createPlan(input: CreatePlanInput) {
    return this.prisma.plan.create({
      data: {
        code: input.code,
        name: input.name,
        description: input.description,
        sortOrder: input.sortOrder ?? 0,
        badgeLabel: input.badgeLabel,
        stripePriceId: input.stripePriceId,
        stripeProductId: input.stripeProductId,
        featureLines: input.featureLines === undefined ? undefined : (input.featureLines as Prisma.InputJsonValue),
        priceAmount: new Prisma.Decimal(input.priceAmount),
        currency: (input.currency ?? 'TRY').toUpperCase(),
        interval: input.interval,
        trialDays: input.trialDays ?? 14,
        maxBranches: input.maxBranches ?? 1,
        maxStaff: input.maxStaff ?? 5,
        maxAppointmentsMo: input.maxAppointmentsMo ?? 500,
        isActive: input.isActive ?? true,
      },
    });
  }

  async updatePlan(id: string, input: UpdatePlanInput) {
    const data: Prisma.PlanUpdateInput = {};
    if (input.name !== undefined) data.name = input.name;
    if (input.description !== undefined) data.description = input.description;
    if (input.sortOrder !== undefined) data.sortOrder = input.sortOrder;
    if (input.badgeLabel !== undefined) data.badgeLabel = input.badgeLabel;
    if (input.stripePriceId !== undefined) data.stripePriceId = input.stripePriceId;
    if (input.stripeProductId !== undefined) data.stripeProductId = input.stripeProductId;
    if (input.featureLines !== undefined) data.featureLines = input.featureLines as Prisma.InputJsonValue;
    if (input.priceAmount !== undefined) data.priceAmount = new Prisma.Decimal(input.priceAmount);
    if (input.currency !== undefined) data.currency = input.currency.toUpperCase();
    if (input.interval !== undefined) data.interval = input.interval;
    if (input.trialDays !== undefined) data.trialDays = input.trialDays;
    if (input.maxBranches !== undefined) data.maxBranches = input.maxBranches;
    if (input.maxStaff !== undefined) data.maxStaff = input.maxStaff;
    if (input.maxAppointmentsMo !== undefined) data.maxAppointmentsMo = input.maxAppointmentsMo;
    if (input.isActive !== undefined) data.isActive = input.isActive;
    return this.prisma.plan.update({ where: { id }, data });
  }

  listBankAccounts(includeInactive: boolean) {
    return this.prisma.platformBankAccount.findMany({
      where: includeInactive ? {} : { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
  }

  async createBankAccount(input: {
    label: string;
    bankName: string;
    accountHolder: string;
    iban: string;
    swift?: string | null;
    currency?: string;
    sortOrder?: number;
    isActive?: boolean;
  }) {
    return this.prisma.platformBankAccount.create({
      data: {
        label: input.label,
        bankName: input.bankName,
        accountHolder: input.accountHolder,
        iban: input.iban.replace(/\s/g, ''),
        swift: input.swift,
        currency: (input.currency ?? 'TRY').toUpperCase(),
        sortOrder: input.sortOrder ?? 0,
        isActive: input.isActive ?? true,
      },
    });
  }

  async updateBankAccount(
    id: string,
    input: Partial<{
      label: string;
      bankName: string;
      accountHolder: string;
      iban: string;
      swift: string | null;
      currency: string;
      sortOrder: number;
      isActive: boolean;
    }>,
  ) {
    const data: Prisma.PlatformBankAccountUpdateInput = {};
    if (input.label !== undefined) data.label = input.label;
    if (input.bankName !== undefined) data.bankName = input.bankName;
    if (input.accountHolder !== undefined) data.accountHolder = input.accountHolder;
    if (input.iban !== undefined) data.iban = input.iban.replace(/\s/g, '');
    if (input.swift !== undefined) data.swift = input.swift;
    if (input.currency !== undefined) data.currency = input.currency.toUpperCase();
    if (input.sortOrder !== undefined) data.sortOrder = input.sortOrder;
    if (input.isActive !== undefined) data.isActive = input.isActive;
    return this.prisma.platformBankAccount.update({ where: { id }, data });
  }

  /**
   * Stripe Checkout — STRIPE_SECRET_KEY ve plan.stripePriceId gerekir.
   * `subscriptionId`: başvuru sonrası oluşan aboneliği ödeme ile eşlemek için zorunlu.
   */
  async createStripeCheckoutSession(body: {
    planCode: string;
    subscriptionId: string;
    successUrl: string;
    cancelUrl: string;
    customerEmail?: string;
  }) {
    const subscription = await this.prisma.subscription.findUnique({
      where: { id: body.subscriptionId },
      include: { plan: true },
    });
    if (!subscription) {
      throw new NotFoundException('Subscription not found');
    }
    if (subscription.plan.code !== body.planCode) {
      throw new BadRequestException('Plan does not match subscription');
    }
    const plan = subscription.plan;
    if (!plan.isActive) {
      throw new NotFoundException('Plan not found');
    }
    const secret = process.env.STRIPE_SECRET_KEY;
    if (!secret) {
      return {
        ok: false as const,
        configured: false,
        message: 'Stripe not configured (STRIPE_SECRET_KEY). Use bank transfer or mock pay.',
        planCode: plan.code,
      };
    }
    const priceId = await this.resolveStripePriceIdForCheckout(plan);
    if (!priceId) {
      return {
        ok: false as const,
        configured: true,
        message:
          'No Stripe price: set stripePriceId (price_...) or stripeProductId (prod_...) on the plan in Super admin → Plans.',
        planCode: plan.code,
      };
    }
    try {
      const stripe = new Stripe(secret);
      const session = await stripe.checkout.sessions.create({
        mode: 'subscription',
        success_url: body.successUrl,
        cancel_url: body.cancelUrl,
        customer_email: body.customerEmail,
        line_items: [{ price: priceId, quantity: 1 }],
        metadata: {
          subscriptionId: subscription.id,
          tenantId: subscription.tenantId,
        },
      });
      return { ok: true as const, configured: true, url: session.url };
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Stripe error';
      return { ok: false as const, configured: true, message: msg };
    }
  }

  /**
   * Stripe Checkout dönüşü — session_id ile ödemeyi doğrular, aboneliği aktifleştirir.
   */
  async completeStripeCheckoutSession(sessionId: string) {
    const secret = process.env.STRIPE_SECRET_KEY;
    if (!secret) {
      throw new BadRequestException('Stripe not configured');
    }
    const stripe = new Stripe(secret);
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    const subscriptionId = session.metadata?.subscriptionId;
    if (!subscriptionId) {
      throw new BadRequestException('Checkout session missing subscription metadata');
    }
    if (session.status !== 'complete') {
      throw new BadRequestException('Checkout session not complete');
    }

    const existing = await this.prisma.payment.findFirst({
      where: { provider: 'stripe', providerRef: session.id },
    });
    if (existing) {
      return { ok: true as const, paymentId: existing.id, alreadyProcessed: true as const };
    }

    const subscription = await this.prisma.subscription.findUnique({
      where: { id: subscriptionId },
      include: { plan: true },
    });
    if (!subscription) {
      throw new NotFoundException('Subscription not found');
    }

    return this.prisma.$transaction(async (tx) => {
      const payment = await tx.payment.create({
        data: {
          subscriptionId,
          amount: subscription.plan.priceAmount,
          currency: subscription.plan.currency,
          status: PaymentStatus.PAID,
          provider: 'stripe',
          providerRef: session.id,
          paidAt: new Date(),
        },
      });
      await tx.subscription.update({
        where: { id: subscriptionId },
        data: {
          status: SubscriptionStatus.ACTIVE,
          trialEndsAt: null,
          nextBillingAt: this.computeNextBilling(subscription.plan.interval, new Date()),
        },
      });
      return { ok: true as const, paymentId: payment.id, alreadyProcessed: false as const };
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

  async onboardTenant(input: {
    companyName: string;
    slug: string;
    vertical: VerticalType;
    defaultCurrency: string;
    companyPhone?: string;
    adminFullName: string;
    adminEmail: string;
    adminPassword: string;
    planCode: string;
    notes?: string;
    applicationKind?: 'company' | 'franchise';
  }) {
    const pwd = input.adminPassword?.trim() ?? '';
    if (pwd.length < 8) {
      throw new BadRequestException('Password must be at least 8 characters');
    }
    const phoneRaw = input.companyPhone?.trim();
    const phone = phoneRaw && phoneRaw.length > 0 ? phoneRaw : undefined;
    const passwordHash = await bcrypt.hash(pwd, BCRYPT_ROUNDS);
    const plan = await this.prisma.plan.findUnique({ where: { code: input.planCode } });
    if (!plan) {
      throw new NotFoundException('Plan not found');
    }
    const trialEndsAt = new Date(Date.now() + plan.trialDays * 24 * 60 * 60 * 1000);
    return this.prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({
        data: {
          name: input.companyName,
          slug: input.slug,
          phone,
          vertical: input.vertical,
          defaultCurrency: input.defaultCurrency.toUpperCase(),
        },
      });
      const branch = await tx.branch.create({
        data: {
          tenantId: tenant.id,
          name: 'Head Office',
          code: 'HQ',
          isActive: true,
        },
      });
      const ownerRole = await tx.role.create({
        data: {
          tenantId: tenant.id,
          code: 'CMP_OWNER',
          name: 'Company Owner',
          description: 'Full tenant access',
        },
      });
      const adminUser = await tx.user.create({
        data: {
          tenantId: tenant.id,
          branchId: branch.id,
          email: input.adminEmail.toLowerCase(),
          fullName: input.adminFullName,
          passwordHash,
          status: UserStatus.ACTIVE,
          isStaff: false,
        },
      });
      await tx.userRole.create({
        data: {
          tenantId: tenant.id,
          userId: adminUser.id,
          roleId: ownerRole.id,
        },
      });
      const subscription = await tx.subscription.create({
        data: {
          tenantId: tenant.id,
          planId: plan.id,
          status: SubscriptionStatus.TRIAL,
          trialEndsAt,
          nextBillingAt: trialEndsAt,
        },
      });
      const meta = {
        applicationKind: input.applicationKind ?? 'company',
        planCode: input.planCode,
        notes: input.notes?.trim() || undefined,
        adminEmail: input.adminEmail.toLowerCase(),
        companyPhone: phone,
      };
      await tx.auditLog.create({
        data: {
          tenantId: tenant.id,
          actorUserId: null,
          entityType: 'TENANT',
          entityId: tenant.id,
          action: 'ONBOARD_APPLICATION',
          metadata: meta,
        },
      });
      return { tenant, branch, adminUser, subscription };
    });
  }

  async mockPay(subscriptionId: string) {
    return this.prisma.$transaction(async (tx) => {
      const subscription = await tx.subscription.findUnique({
        where: { id: subscriptionId },
        include: { plan: true },
      });
      if (!subscription) {
        throw new NotFoundException('Subscription not found');
      }

      const existingPaid = await tx.payment.findFirst({
        where: { subscriptionId, status: PaymentStatus.PAID },
      });
      if (existingPaid) {
        await tx.subscription.update({
          where: { id: subscriptionId },
          data: {
            status: SubscriptionStatus.ACTIVE,
            trialEndsAt: null,
            nextBillingAt: this.computeNextBilling(subscription.plan.interval, new Date()),
          },
        });
        return existingPaid;
      }

      const payment = await tx.payment.create({
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
      await tx.subscription.update({
        where: { id: subscriptionId },
        data: {
          status: SubscriptionStatus.ACTIVE,
          trialEndsAt: null,
          nextBillingAt: this.computeNextBilling(subscription.plan.interval, new Date()),
        },
      });
      return payment;
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
      take: 50,
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

  /** Kiracı paneli: abonelik, ödeme geçmişi, platform banka bilgisi (tahsilat) */
  async tenantBillingDashboard(tenantSlug: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { slug: tenantSlug },
      include: {
        subscriptions: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          include: {
            plan: true,
            payments: {
              orderBy: { createdAt: 'desc' },
              take: 50,
            },
          },
        },
      },
    });
    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }
    const sub = tenant.subscriptions[0];
    const banks = await this.listBankAccounts(false);
    return {
      tenant: {
        id: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
        vertical: tenant.vertical,
        defaultCurrency: tenant.defaultCurrency,
      },
      subscription: sub
        ? {
            id: sub.id,
            status: sub.status,
            startsAt: sub.startsAt,
            endsAt: sub.endsAt,
            trialEndsAt: sub.trialEndsAt,
            nextBillingAt: sub.nextBillingAt,
            cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
            plan: {
              code: sub.plan.code,
              name: sub.plan.name,
              description: sub.plan.description,
              priceAmount: sub.plan.priceAmount,
              currency: sub.plan.currency,
              interval: sub.plan.interval,
              maxBranches: sub.plan.maxBranches,
              maxStaff: sub.plan.maxStaff,
              maxAppointmentsMo: sub.plan.maxAppointmentsMo,
              trialDays: sub.plan.trialDays,
              stripePriceId: sub.plan.stripePriceId,
            },
            payments: sub.payments.map((p) => ({
              id: p.id,
              amount: p.amount,
              currency: p.currency,
              status: p.status,
              provider: p.provider,
              providerRef: p.providerRef,
              paidAt: p.paidAt,
              createdAt: p.createdAt,
            })),
          }
        : null,
      bankAccounts: banks,
    };
  }

  /** Kiracı özeti: operasyon + abonelik özeti (rol bazlı dashboard) */
  async tenantOverviewStats(tenantSlug: string) {
    const tenant = await this.prisma.tenant.findUnique({ where: { slug: tenantSlug } });
    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const [branchCount, staffCount, appt7d, apptTotal, ledgerSum, sub] = await Promise.all([
      this.prisma.branch.count({ where: { tenantId: tenant.id, deletedAt: null } }),
      this.prisma.staffProfile.count({ where: { tenantId: tenant.id } }),
      this.prisma.appointment.count({ where: { tenantId: tenant.id, createdAt: { gte: since } } }),
      this.prisma.appointment.count({ where: { tenantId: tenant.id } }),
      this.prisma.ledgerEntry.aggregate({
        where: { tenantId: tenant.id, type: 'INCOME' },
        _sum: { amount: true },
      }),
      this.prisma.subscription.findFirst({
        where: { tenantId: tenant.id },
        orderBy: { createdAt: 'desc' },
        include: { plan: true },
      }),
    ]);

    return {
      tenant: {
        name: tenant.name,
        slug: tenant.slug,
        vertical: tenant.vertical,
        defaultCurrency: tenant.defaultCurrency,
      },
      metrics: {
        branches: branchCount,
        staff: staffCount,
        appointmentsLast7Days: appt7d,
        appointmentsTotal: apptTotal,
        serviceIncomeTotal: ledgerSum._sum.amount ?? 0,
      },
      subscription: sub
        ? {
            id: sub.id,
            status: sub.status,
            planName: sub.plan.name,
            planCode: sub.plan.code,
            nextBillingAt: sub.nextBillingAt,
            trialEndsAt: sub.trialEndsAt,
          }
        : null,
    };
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
