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
  { slug: 'demo-tenant', name: 'Aura Güzellik Merkezi', vertical: VerticalType.BEAUTY, planCode: 'GROWTH_MONTHLY' },
  { slug: 'ankara-clinic', name: 'Çankaya Ağız ve Diş Polikliniği', vertical: VerticalType.HEALTH, planCode: 'STARTER_MONTHLY' },
  { slug: 'izmir-beauty', name: 'Glow İzmir Güzellik Salonu', vertical: VerticalType.BEAUTY, planCode: 'STARTER_MONTHLY' },
  { slug: 'bursa-hospital', name: 'Bursa Kardiyoloji Polikliniği', vertical: VerticalType.HEALTH, planCode: 'ENTERPRISE_YEARLY' },
  { slug: 'istanbul-restaurant', name: 'Bebek Boğaz Restoran', vertical: VerticalType.RESTAURANT, planCode: 'GROWTH_MONTHLY' },
];

/** Tek şube adı: sektöre uygun (güzellik → salon, sağlık → poliklinik, restoran → restoran) */
function hqBranchName(tenantName, vertical) {
  if (vertical === VerticalType.BEAUTY) return `${tenantName} · Merkez Salon`;
  if (vertical === VerticalType.HEALTH) return `${tenantName} · Poliklinik Merkezi`;
  if (vertical === VerticalType.RESTAURANT) return `${tenantName} · Ana Restoran`;
  return `${tenantName} · Merkez`;
}

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

  /** Tek şube (Merkez / HQ) — şirket adıyla uyumlu; tenant değişince listede net ayrım */
  const cityBySlug = {
    'demo-tenant': 'İstanbul',
    'ankara-clinic': 'Ankara',
    'izmir-beauty': 'İzmir',
    'bursa-hospital': 'Bursa',
    'istanbul-restaurant': 'İstanbul',
  };
  const city = cityBySlug[tenantMeta.slug] ?? 'İstanbul';
  const branchDisplayName = hqBranchName(tenantMeta.name, tenantMeta.vertical);
  const branch = await prisma.branch.upsert({
    where: { tenantId_code: { tenantId: tenant.id, code: 'HQ' } },
    update: {
      name: branchDisplayName,
    },
    create: {
      tenantId: tenant.id,
      name: branchDisplayName,
      code: 'HQ',
      city,
      country: 'TR',
    },
  });
  const branches = [branch];

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

  /** Demo: az personel — takvim okunaklı kalsın */
  const staffSpecs =
    tenantMeta.vertical === VerticalType.RESTAURANT
      ? []
      : tenantMeta.vertical === VerticalType.BEAUTY
        ? ['Stylist', 'Color Specialist', 'Skin Therapist']
        : ['Dentist', 'Assistant', 'Orthodontist'];

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

  const coreCatName =
    tenantMeta.vertical === VerticalType.BEAUTY
      ? 'Beauty Core'
      : tenantMeta.vertical === VerticalType.HEALTH
        ? 'Health Core'
        : 'Restaurant Core';

  const categoryA = await prisma.serviceCategory.upsert({
    where: {
      tenantId_name_vertical: {
        tenantId: tenant.id,
        name: coreCatName,
        vertical: tenantMeta.vertical,
      },
    },
    update: {},
    create: {
      tenantId: tenant.id,
      name: coreCatName,
      vertical: tenantMeta.vertical,
    },
  });

  const serviceNames =
    tenantMeta.vertical === VerticalType.BEAUTY
      ? ['Hair Cut', 'Skin Care', 'Nail Care']
      : tenantMeta.vertical === VerticalType.HEALTH
        ? ['Dental Check', 'Orthodontic Consult', 'Teeth Cleaning']
        : ['Akşam yemeği (2 kişi)', 'Brunch masası', 'Özel gün menüsü'];
  const services = [];
  for (let i = 0; i < serviceNames.length; i += 1) {
    const durationMin =
      tenantMeta.vertical === VerticalType.RESTAURANT ? [90, 75, 120][i] : 30 + i * 15;
    const priceAmount = tenantMeta.vertical === VerticalType.RESTAURANT ? [1200, 850, 2100][i] : 500 + i * 300;
    const service = await prisma.service.upsert({
      where: { id: `svc-${tenantMeta.slug}-${i + 1}` },
      update: { name: serviceNames[i] },
      create: {
        id: `svc-${tenantMeta.slug}-${i + 1}`,
        tenantId: tenant.id,
        branchId: branches[i % branches.length].id,
        categoryId: categoryA.id,
        name: serviceNames[i],
        durationMin,
        priceAmount,
        currency: 'TRY',
      },
    });
    services.push(service);
  }

  /** Restoran: gelir merkezi alanları + açılış saatleri + örnek özel gün fiyatı */
  let restaurantAreas = [];
  if (tenantMeta.vertical === VerticalType.RESTAURANT) {
    const areaDefs = [
      { code: 'GARDEN', name: 'Bahçe', revenueLabel: 'RC-BAHÇE', sortOrder: 1 },
      { code: 'TERRACE', name: 'Teras', revenueLabel: 'RC-TERAS', sortOrder: 2 },
      { code: 'MAIN', name: 'İç Salon', revenueLabel: 'RC-İÇ', sortOrder: 3 },
      { code: 'VIP', name: 'VIP Köşe', revenueLabel: 'RC-VIP', sortOrder: 4 },
    ];
    for (const a of areaDefs) {
      const area = await prisma.restaurantArea.upsert({
        where: {
          tenantId_branchId_code: { tenantId: tenant.id, branchId: branches[0].id, code: a.code },
        },
        update: { name: a.name, revenueLabel: a.revenueLabel, sortOrder: a.sortOrder, isActive: true },
        create: {
          tenantId: tenant.id,
          branchId: branches[0].id,
          name: a.name,
          code: a.code,
          revenueLabel: a.revenueLabel,
          sortOrder: a.sortOrder,
          capacity: 8,
          isActive: true,
        },
      });
      restaurantAreas.push(area);
    }

    const nowSeed = new Date();
    const todaySeed = new Date(Date.UTC(nowSeed.getUTCFullYear(), nowSeed.getUTCMonth(), nowSeed.getUTCDate()));

    /** Bugünden itibaren 10 gün: her alan için tek servis penceresi (12:00–23:00 yerel UTC günü) */
    for (let d = 0; d < 10; d += 1) {
      const day = new Date(todaySeed.getTime() + d * 24 * 60 * 60 * 1000);
      for (let ai = 0; ai < restaurantAreas.length; ai += 1) {
        const shiftStart = new Date(day);
        shiftStart.setUTCHours(12, 0, 0, 0);
        const shiftEnd = new Date(day);
        shiftEnd.setUTCHours(23, 0, 0, 0);
        const sid = `ras-${tenantMeta.slug}-${restaurantAreas[ai].code}-${d}`;
        await prisma.restaurantAreaSchedule.upsert({
          where: { id: sid },
          update: { startsAt: shiftStart, endsAt: shiftEnd },
          create: {
            id: sid,
            tenantId: tenant.id,
            branchId: branches[0].id,
            restaurantAreaId: restaurantAreas[ai].id,
            startsAt: shiftStart,
            endsAt: shiftEnd,
          },
        });
      }
    }

    const specialDay = new Date(todaySeed.getTime() + 3 * 24 * 60 * 60 * 1000);
    specialDay.setUTCHours(12, 0, 0, 0);
    await prisma.branchPricingDay.upsert({
      where: { branchId_date: { branchId: branches[0].id, date: specialDay } },
      update: {
        label: 'Önemli gün — ek ücret',
        surchargePercent: 15,
        extraAmount: 0,
        note: 'Örnek: özel menü günü %15 ek ücret',
        isActive: true,
      },
      create: {
        tenantId: tenant.id,
        branchId: branches[0].id,
        date: specialDay,
        label: 'Önemli gün — ek ücret',
        surchargePercent: 15,
        extraAmount: 0,
        note: 'Örnek: özel menü günü %15 ek ücret',
        isActive: true,
      },
    });
  }

  const customers = [];
  const customerCount = 8;
  for (let c = 0; c < customerCount; c += 1) {
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

  // Staff weekly shifts with deterministic off-days (restoran tenant'ta personel yok).
  if (staffUsers.length > 0) {
    for (let s = 0; s < staffUsers.length; s += 1) {
      for (let d = 0; d < 10; d += 1) {
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
  }

  const appointmentSeedCount = 14;
  for (let i = 0; i < appointmentSeedCount; i += 1) {
    const dayOffset = i % 7;
    const day = new Date(today.getTime() + dayOffset * 24 * 60 * 60 * 1000);
    const hour = 10 + (i % 6);
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
        staffUserId:
          tenantMeta.vertical === VerticalType.RESTAURANT ? null : staffUsers[i % staffUsers.length].id,
        restaurantAreaId:
          tenantMeta.vertical === VerticalType.RESTAURANT ? restaurantAreas[i % restaurantAreas.length].id : null,
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
    'Tek ve çift şube; misafir rezervasyonu ve çalışan takvimi',
    'Bildirimler ve temel operasyon akışları',
    'Ön muhasebe / kasa kayıtları (paket kotasına göre)',
  ];
  const growthFeatures = [
    'Çok şube yönetimi; şube bazlı hizmet ve roller',
    'Operasyon ekranı, atama ve durum takibi',
    'Raporlama ve faturalama entegrasyonuna hazır altyapı',
  ];
  const entFeatures = [
    'Yüksek şube ve personel kotası; büyük hacim randevu',
    'SLA, özel entegrasyon ve veri izolasyonu seçenekleri',
    'Havale/EFT ve Stripe ile platform üzerinden tahsilat',
  ];

  const plans = await Promise.all([
    prisma.plan.upsert({
      where: { code: 'STARTER_MONTHLY' },
      update: {
        name: 'Başlangıç',
        description: 'Küçük ve tek nokta işletmeler için giriş seviyesi paket.',
        sortOrder: 1,
        isActive: true,
        badgeLabel: null,
        stripePriceId: null,
        stripeProductId: 'prod_UCDKAVRNr1ro2o',
        featureLines: starterFeatures,
        priceAmount: 1299,
        maxBranches: 2,
        maxStaff: 18,
        maxAppointmentsMo: 3500,
        trialDays: 14,
      },
      create: {
        code: 'STARTER_MONTHLY',
        name: 'Başlangıç',
        description: 'Küçük ve tek nokta işletmeler için giriş seviyesi paket.',
        sortOrder: 1,
        badgeLabel: null,
        stripePriceId: null,
        stripeProductId: 'prod_UCDKAVRNr1ro2o',
        featureLines: starterFeatures,
        priceAmount: 1299,
        currency: 'TRY',
        interval: BillingInterval.MONTHLY,
        maxBranches: 2,
        maxStaff: 18,
        maxAppointmentsMo: 3500,
        trialDays: 14,
        isActive: true,
      },
    }),
    prisma.plan.upsert({
      where: { code: 'GROWTH_MONTHLY' },
      update: {
        name: 'Orta ölçek',
        description: 'Büyüyen ve çok şubeli işletmeler için orta ölçek paket.',
        sortOrder: 2,
        isActive: true,
        badgeLabel: 'En çok tercih edilen',
        stripePriceId: null,
        stripeProductId: 'prod_UCDKaBRouUUOdv',
        featureLines: growthFeatures,
        priceAmount: 3499,
        maxBranches: 12,
        maxStaff: 90,
        maxAppointmentsMo: 30000,
        trialDays: 14,
      },
      create: {
        code: 'GROWTH_MONTHLY',
        name: 'Orta ölçek',
        description: 'Büyüyen ve çok şubeli işletmeler için orta ölçek paket.',
        sortOrder: 2,
        badgeLabel: 'En çok tercih edilen',
        stripePriceId: null,
        stripeProductId: 'prod_UCDKaBRouUUOdv',
        featureLines: growthFeatures,
        priceAmount: 3499,
        currency: 'TRY',
        interval: BillingInterval.MONTHLY,
        maxBranches: 12,
        maxStaff: 90,
        maxAppointmentsMo: 30000,
        trialDays: 14,
        isActive: true,
      },
    }),
    prisma.plan.upsert({
      where: { code: 'ENTERPRISE_YEARLY' },
      update: {
        name: 'Kurumsal',
        description: 'Ülke çapı organizasyonlar ve yüksek iş hacmi için kurumsal paket.',
        sortOrder: 3,
        isActive: true,
        badgeLabel: null,
        stripePriceId: null,
        stripeProductId: 'prod_UCDKfsX9j3LtRr',
        featureLines: entFeatures,
        priceAmount: 34999,
        maxBranches: 999,
        maxStaff: 9999,
        maxAppointmentsMo: 500000,
        trialDays: 30,
      },
      create: {
        code: 'ENTERPRISE_YEARLY',
        name: 'Kurumsal',
        description: 'Ülke çapı organizasyonlar ve yüksek iş hacmi için kurumsal paket.',
        sortOrder: 3,
        badgeLabel: null,
        stripePriceId: null,
        stripeProductId: 'prod_UCDKfsX9j3LtRr',
        featureLines: entFeatures,
        priceAmount: 34999,
        currency: 'TRY',
        interval: BillingInterval.YEARLY,
        maxBranches: 999,
        maxStaff: 9999,
        maxAppointmentsMo: 500000,
        trialDays: 30,
        isActive: true,
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
