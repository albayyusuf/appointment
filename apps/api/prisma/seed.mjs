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
  for (let c = 0; c < 10; c += 1) {
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
  for (let i = 0; i < 20; i += 1) {
    const startsAt = new Date(now.getTime() + (i + 1) * 45 * 60 * 1000);
    const endsAt = new Date(startsAt.getTime() + 30 * 60 * 1000);
    const status = i % 5 === 0 ? AppointmentStatus.IN_PROGRESS : i % 2 === 0 ? AppointmentStatus.CONFIRMED : AppointmentStatus.PENDING;

    const appointment = await prisma.appointment.upsert({
      where: { id: `appt-${tenantMeta.slug}-${i + 1}` },
      update: { startsAt, endsAt, status },
      create: {
        id: `appt-${tenantMeta.slug}-${i + 1}`,
        tenantId: tenant.id,
        branchId: branches[i % branches.length].id,
        customerId: customers[i % customers.length].id,
        serviceId: services[i % services.length].id,
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

  const plans = await Promise.all([
    prisma.plan.upsert({
      where: { code: 'STARTER_MONTHLY' },
      update: {},
      create: {
        code: 'STARTER_MONTHLY',
        name: 'Starter',
        description: 'Small teams and single branch businesses',
        priceAmount: 1499,
        currency: 'TRY',
        interval: BillingInterval.MONTHLY,
        maxBranches: 2,
        maxStaff: 12,
        maxAppointmentsMo: 2500,
      },
    }),
    prisma.plan.upsert({
      where: { code: 'GROWTH_MONTHLY' },
      update: {},
      create: {
        code: 'GROWTH_MONTHLY',
        name: 'Growth',
        description: 'Growing multi-branch companies',
        priceAmount: 3999,
        currency: 'TRY',
        interval: BillingInterval.MONTHLY,
        maxBranches: 10,
        maxStaff: 80,
        maxAppointmentsMo: 25000,
      },
    }),
    prisma.plan.upsert({
      where: { code: 'ENTERPRISE_YEARLY' },
      update: {},
      create: {
        code: 'ENTERPRISE_YEARLY',
        name: 'Enterprise',
        description: 'Franchise and hospital scale operations',
        priceAmount: 39999,
        currency: 'TRY',
        interval: BillingInterval.YEARLY,
        maxBranches: 999,
        maxStaff: 9999,
        maxAppointmentsMo: 500000,
      },
    }),
  ]);

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
