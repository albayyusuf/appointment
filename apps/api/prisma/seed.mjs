import {
  PrismaClient,
  VerticalType,
  UserStatus,
  AppointmentStatus,
  BillingInterval,
  SubscriptionStatus,
  PaymentStatus,
} from '@prisma/client';

const prisma = new PrismaClient();

const tenantSeeds = [
  { slug: 'demo-tenant', name: 'Demo Tenant', vertical: VerticalType.BEAUTY, planCode: 'GROWTH_MONTHLY' },
  { slug: 'ankara-clinic', name: 'Ankara Smile Clinic', vertical: VerticalType.HEALTH, planCode: 'STARTER_MONTHLY' },
  { slug: 'izmir-beauty', name: 'Izmir Beauty Lounge', vertical: VerticalType.BEAUTY, planCode: 'STARTER_MONTHLY' },
  { slug: 'bursa-hospital', name: 'Bursa Med Center', vertical: VerticalType.HEALTH, planCode: 'ENTERPRISE_YEARLY' },
];

function statusForIndex(index) {
  if (index % 4 === 0) return SubscriptionStatus.ACTIVE;
  if (index % 4 === 1) return SubscriptionStatus.TRIAL;
  if (index % 4 === 2) return SubscriptionStatus.PAST_DUE;
  return SubscriptionStatus.CANCELED;
}

async function seedTenant(tenantMeta, plans, index) {
  const tenant = await prisma.tenant.upsert({
    where: { slug: tenantMeta.slug },
    update: { name: tenantMeta.name, vertical: tenantMeta.vertical },
    create: {
      name: tenantMeta.name,
      slug: tenantMeta.slug,
      vertical: tenantMeta.vertical,
    },
  });

  const branchCodes = ['HQ', 'B1', 'B2'];
  const branches = [];
  for (const [idx, code] of branchCodes.entries()) {
    const branch = await prisma.branch.upsert({
      where: { tenantId_code: { tenantId: tenant.id, code } },
      update: { name: `${tenantMeta.name} Branch ${idx + 1}` },
      create: {
        tenantId: tenant.id,
        name: `${tenantMeta.name} Branch ${idx + 1}`,
        code,
        city: ['Istanbul', 'Ankara', 'Izmir'][idx % 3],
        country: 'TR',
      },
    });
    branches.push(branch);
  }

  const roleAdmin = await prisma.role.upsert({
    where: { tenantId_code: { tenantId: tenant.id, code: 'ADMIN' } },
    update: { name: 'Tenant Admin' },
    create: {
      tenantId: tenant.id,
      code: 'ADMIN',
      name: 'Tenant Admin',
      description: 'Full access to tenant resources',
    },
  });

  const roleStaff = await prisma.role.upsert({
    where: { tenantId_code: { tenantId: tenant.id, code: 'STAFF' } },
    update: { name: 'Staff' },
    create: {
      tenantId: tenant.id,
      code: 'STAFF',
      name: 'Staff',
      description: 'Operational access for appointments',
    },
  });

  const adminEmail = `owner@${tenantMeta.slug}.com`;
  const adminUser = await prisma.user.upsert({
    where: { tenantId_email: { tenantId: tenant.id, email: adminEmail } },
    update: { fullName: `${tenantMeta.name} Owner`, status: UserStatus.ACTIVE },
    create: {
      tenantId: tenant.id,
      branchId: branches[0].id,
      email: adminEmail,
      passwordHash: 'owner-demo-hash',
      fullName: `${tenantMeta.name} Owner`,
      status: UserStatus.ACTIVE,
      isStaff: false,
    },
  });

  await prisma.userRole.upsert({
    where: { tenantId_userId_roleId: { tenantId: tenant.id, userId: adminUser.id, roleId: roleAdmin.id } },
    update: {},
    create: { tenantId: tenant.id, userId: adminUser.id, roleId: roleAdmin.id },
  });

  const staffSpecs = tenantMeta.vertical === VerticalType.BEAUTY
    ? ['Stylist', 'Color Specialist', 'Skin Therapist', 'Nail Expert']
    : ['Dentist', 'Assistant', 'Orthodontist', 'Hygienist'];

  const staffUsers = [];
  for (let s = 0; s < staffSpecs.length; s += 1) {
    const email = `staff${s + 1}@${tenantMeta.slug}.com`;
    const user = await prisma.user.upsert({
      where: { tenantId_email: { tenantId: tenant.id, email } },
      update: { fullName: `${tenantMeta.name} Staff ${s + 1}`, status: UserStatus.ACTIVE, isStaff: true },
      create: {
        tenantId: tenant.id,
        branchId: branches[s % branches.length].id,
        email,
        passwordHash: 'staff-demo-hash',
        fullName: `${tenantMeta.name} Staff ${s + 1}`,
        status: UserStatus.ACTIVE,
        isStaff: true,
      },
    });
    staffUsers.push(user);

    await prisma.staffProfile.upsert({
      where: { userId: user.id },
      update: { specialty: staffSpecs[s] },
      create: {
        tenantId: tenant.id,
        userId: user.id,
        specialty: staffSpecs[s],
      },
    });

    await prisma.userRole.upsert({
      where: { tenantId_userId_roleId: { tenantId: tenant.id, userId: user.id, roleId: roleStaff.id } },
      update: {},
      create: { tenantId: tenant.id, userId: user.id, roleId: roleStaff.id },
    });
  }

  const categoryA = await prisma.serviceCategory.upsert({
    where: {
      tenantId_name_vertical: {
        tenantId: tenant.id,
        name: tenantMeta.vertical === VerticalType.BEAUTY ? 'Beauty Core' : 'Health Core',
        vertical: tenantMeta.vertical,
      },
    },
    update: {},
    create: {
      tenantId: tenant.id,
      name: tenantMeta.vertical === VerticalType.BEAUTY ? 'Beauty Core' : 'Health Core',
      vertical: tenantMeta.vertical,
    },
  });

  const serviceNames = tenantMeta.vertical === VerticalType.BEAUTY
    ? ['Hair Cut', 'Skin Care', 'Nail Care']
    : ['Dental Check', 'Orthodontic Consult', 'Teeth Cleaning'];
  const services = [];
  for (let i = 0; i < serviceNames.length; i += 1) {
    const service = await prisma.service.upsert({
      where: { id: `svc-${tenantMeta.slug}-${i + 1}` },
      update: { name: serviceNames[i] },
      create: {
        id: `svc-${tenantMeta.slug}-${i + 1}`,
        tenantId: tenant.id,
        branchId: branches[i % branches.length].id,
        categoryId: categoryA.id,
        name: serviceNames[i],
        durationMin: 30 + i * 15,
        priceAmount: 500 + i * 300,
        currency: 'TRY',
      },
    });
    services.push(service);
  }

  const customers = [];
  for (let c = 0; c < 40; c += 1) {
    const customer = await prisma.customer.upsert({
      where: { id: `cus-${tenantMeta.slug}-${c + 1}` },
      update: { fullName: `${tenantMeta.name} Customer ${c + 1}` },
      create: {
        id: `cus-${tenantMeta.slug}-${c + 1}`,
        tenantId: tenant.id,
        fullName: `${tenantMeta.name} Customer ${c + 1}`,
        phone: `+90531${String(index)}${String(c).padStart(6, '0')}`,
        email: `customer${c + 1}@${tenantMeta.slug}.com`,
      },
    });
    customers.push(customer);
  }

  const now = new Date();
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

  // Staff weekly shifts with deterministic off-days.
  for (let s = 0; s < staffUsers.length; s += 1) {
    for (let d = -2; d < 14; d += 1) {
      const day = new Date(today.getTime() + d * 24 * 60 * 60 * 1000);
      const weekday = day.getUTCDay(); // 0 sun ... 6 sat
      const offDayRule = (weekday === 0) || ((s + index) % 2 === 0 && weekday === 2) || ((s + index) % 2 === 1 && weekday === 5);
      if (offDayRule) continue;
      const shiftStart = new Date(day);
      shiftStart.setUTCHours(8 + (s % 2), 0, 0, 0);
      const shiftEnd = new Date(day);
      shiftEnd.setUTCHours(17 + (s % 2), 0, 0, 0);
      await prisma.schedule.upsert({
        where: { id: `sch-${tenantMeta.slug}-${staffUsers[s].id}-${d}` },
        update: { startsAt: shiftStart, endsAt: shiftEnd },
        create: {
          id: `sch-${tenantMeta.slug}-${staffUsers[s].id}-${d}`,
          tenantId: tenant.id,
          branchId: staffUsers[s].branchId ?? branches[0].id,
          staffUserId: staffUsers[s].id,
          startsAt: shiftStart,
          endsAt: shiftEnd,
        },
      });
    }
  }

  for (let i = 0; i < 80; i += 1) {
    const dayOffset = Math.floor(i / 8) - 2;
    const day = new Date(today.getTime() + dayOffset * 24 * 60 * 60 * 1000);
    const hour = 9 + (i % 8);
    const startsAt = new Date(day);
    startsAt.setUTCHours(hour, (i % 2) * 30, 0, 0);
    const service = services[i % services.length];
    const endsAt = new Date(startsAt.getTime() + service.durationMin * 60 * 1000);
    const status =
      i % 7 === 0
        ? AppointmentStatus.COMPLETED
        : i % 5 === 0
          ? AppointmentStatus.IN_PROGRESS
          : i % 2 === 0
            ? AppointmentStatus.CONFIRMED
            : AppointmentStatus.PENDING;

    const appointment = await prisma.appointment.upsert({
      where: { id: `appt-${tenantMeta.slug}-${i + 1}` },
      update: { startsAt, endsAt, status },
      create: {
        id: `appt-${tenantMeta.slug}-${i + 1}`,
        tenantId: tenant.id,
        branchId: branches[i % branches.length].id,
        customerId: customers[i % customers.length].id,
        serviceId: service.id,
        staffUserId: staffUsers[i % staffUsers.length].id,
        createdByUserId: adminUser.id,
        startsAt,
        endsAt,
        status,
        notes: 'Seeded fake appointment',
      },
    });

    await prisma.appointmentStatusHistory.upsert({
      where: { id: `hist-${tenantMeta.slug}-${i + 1}` },
      update: { toStatus: status },
      create: {
        id: `hist-${tenantMeta.slug}-${i + 1}`,
        tenantId: tenant.id,
        appointmentId: appointment.id,
        changedByUserId: adminUser.id,
        fromStatus: AppointmentStatus.PENDING,
        toStatus: status,
      },
    });

    if (status === AppointmentStatus.COMPLETED) {
      await prisma.ledgerEntry.upsert({
        where: { id: `ledger-${tenantMeta.slug}-${i + 1}` },
        update: { amount: service.priceAmount, currency: service.currency },
        create: {
          id: `ledger-${tenantMeta.slug}-${i + 1}`,
          tenantId: tenant.id,
          appointmentId: appointment.id,
          type: 'INCOME',
          amount: service.priceAmount,
          currency: service.currency,
          description: `Seed completed appointment income ${appointment.id}`,
        },
      });
    }
  }

  const selectedPlan = plans.find((p) => p.code === tenantMeta.planCode) ?? plans[0];
  const subStatus = statusForIndex(index);
  const subscription = await prisma.subscription.upsert({
    where: { id: `sub-${tenantMeta.slug}` },
    update: { status: subStatus },
    create: {
      id: `sub-${tenantMeta.slug}`,
      tenantId: tenant.id,
      planId: selectedPlan.id,
      status: subStatus,
      startsAt: now,
      trialEndsAt: subStatus === SubscriptionStatus.TRIAL ? new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000) : null,
      nextBillingAt: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
      cancelAtPeriodEnd: subStatus === SubscriptionStatus.CANCELED,
    },
  });

  for (let p = 0; p < 4; p += 1) {
    const createdAt = new Date(now.getTime() - p * 28 * 24 * 60 * 60 * 1000);
    const status = p === 0 && subStatus === SubscriptionStatus.PAST_DUE ? PaymentStatus.FAILED : PaymentStatus.PAID;
    await prisma.payment.upsert({
      where: { id: `pay-${tenantMeta.slug}-${p + 1}` },
      update: { status },
      create: {
        id: `pay-${tenantMeta.slug}-${p + 1}`,
        subscriptionId: subscription.id,
        amount: selectedPlan.priceAmount,
        currency: selectedPlan.currency,
        status,
        provider: 'mock-gateway',
        providerRef: `MOCK-${tenantMeta.slug}-${p + 1}`,
        paidAt: status === PaymentStatus.PAID ? createdAt : null,
        failedAt: status === PaymentStatus.FAILED ? createdAt : null,
        createdAt,
      },
    });
  }
}

async function main() {
  await prisma.platformUser.upsert({
    where: { email: 'superadmin@appointment.local' },
    update: { fullName: 'Platform Super Admin', isSuperAdmin: true },
    create: {
      email: 'superadmin@appointment.local',
      fullName: 'Platform Super Admin',
      passwordHash: 'superadmin-demo-hash',
      isSuperAdmin: true,
    },
  });

  const starterFeatures = [
    'Güzellik salonu, barber, nail: tek–çift şube',
    'Misafir rezervasyonu, çalışan takvimi, bildirimler',
    'Ön muhasebe / kasa kayıtları (paket kotasına göre)',
  ];
  const growthFeatures = [
    'Klinik & çok şube: şube bazlı hizmet ve roller',
    'Operasyon ekranı, atama, durum akışı',
    'Raporlama ve SaaS faturalama entegrasyonuna hazır',
  ];
  const entFeatures = [
    'Franchise / zincir: sınırsız şube kotası',
    'Kurumsal SLA, özel entegrasyon ve veri izolasyonu',
    'Havale/EFT + Stripe ile tahsilat (platform hesapları)',
  ];

  const plans = await Promise.all([
    prisma.plan.upsert({
      where: { code: 'STARTER_MONTHLY' },
      update: {
        name: 'Salon & Studio',
        description: 'Güzellik, berber, nail ve tek şube işletmeleri için giriş paketi.',
        sortOrder: 1,
        badgeLabel: 'Başlangıç',
        stripePriceId: null,
        featureLines: starterFeatures,
        priceAmount: 1299,
        maxBranches: 2,
        maxStaff: 18,
        maxAppointmentsMo: 3500,
        trialDays: 14,
      },
      create: {
        code: 'STARTER_MONTHLY',
        name: 'Salon & Studio',
        description: 'Güzellik, berber, nail ve tek şube işletmeleri için giriş paketi.',
        sortOrder: 1,
        badgeLabel: 'Başlangıç',
        stripePriceId: null,
        featureLines: starterFeatures,
        priceAmount: 1299,
        currency: 'TRY',
        interval: BillingInterval.MONTHLY,
        maxBranches: 2,
        maxStaff: 18,
        maxAppointmentsMo: 3500,
        trialDays: 14,
      },
    }),
    prisma.plan.upsert({
      where: { code: 'GROWTH_MONTHLY' },
      update: {
        name: 'Klinik & Operasyon',
        description: 'Sağlık, diş ve çok şubeli klinikler için operasyon odağı.',
        sortOrder: 2,
        badgeLabel: 'En çok tercih edilen',
        stripePriceId: null,
        featureLines: growthFeatures,
        priceAmount: 3499,
        maxBranches: 12,
        maxStaff: 90,
        maxAppointmentsMo: 30000,
        trialDays: 14,
      },
      create: {
        code: 'GROWTH_MONTHLY',
        name: 'Klinik & Operasyon',
        description: 'Sağlık, diş ve çok şubeli klinikler için operasyon odağı.',
        sortOrder: 2,
        badgeLabel: 'En çok tercih edilen',
        stripePriceId: null,
        featureLines: growthFeatures,
        priceAmount: 3499,
        currency: 'TRY',
        interval: BillingInterval.MONTHLY,
        maxBranches: 12,
        maxStaff: 90,
        maxAppointmentsMo: 30000,
        trialDays: 14,
      },
    }),
    prisma.plan.upsert({
      where: { code: 'ENTERPRISE_YEARLY' },
      update: {
        name: 'Zincir & Franchise',
        description: 'Ülke çapı zincir, hastane grupları ve franchise yönetimi.',
        sortOrder: 3,
        badgeLabel: 'Kurumsal',
        stripePriceId: null,
        featureLines: entFeatures,
        priceAmount: 34999,
        maxBranches: 999,
        maxStaff: 9999,
        maxAppointmentsMo: 500000,
        trialDays: 30,
      },
      create: {
        code: 'ENTERPRISE_YEARLY',
        name: 'Zincir & Franchise',
        description: 'Ülke çapı zincir, hastane grupları ve franchise yönetimi.',
        sortOrder: 3,
        badgeLabel: 'Kurumsal',
        stripePriceId: null,
        featureLines: entFeatures,
        priceAmount: 34999,
        currency: 'TRY',
        interval: BillingInterval.YEARLY,
        maxBranches: 999,
        maxStaff: 9999,
        maxAppointmentsMo: 500000,
        trialDays: 30,
      },
    }),
  ]);

  await prisma.platformBankAccount.upsert({
    where: { id: 'seed-bank-main' },
    update: {
      label: 'Ana tahsilat (TRY)',
      bankName: 'Türkiye İş Bankası',
      accountHolder: 'AppointmentOS Teknoloji A.Ş.',
      iban: 'TR330006100519786457841326',
      swift: 'ISBKTRISXXX',
      sortOrder: 0,
      isActive: true,
    },
    create: {
      id: 'seed-bank-main',
      label: 'Ana tahsilat (TRY)',
      bankName: 'Türkiye İş Bankası',
      accountHolder: 'AppointmentOS Teknoloji A.Ş.',
      iban: 'TR330006100519786457841326',
      swift: 'ISBKTRISXXX',
      sortOrder: 0,
      isActive: true,
    },
  });

  for (const [index, seed] of tenantSeeds.entries()) {
    await seedTenant(seed, plans, index);
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
