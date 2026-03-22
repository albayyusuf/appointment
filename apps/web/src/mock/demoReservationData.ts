/**
 * Demo veri — API yokken veya demo tenant (id 1–3) seçiliyken.
 * Her şirket için tek şube: isimler üstteki şirket adıyla uyumlu (tenant değişince net ayrım).
 */

export type BranchLite = { id: string; name: string; code: string };
export type ServiceLite = {
  id: string;
  name: string;
  durationMin: number;
  priceAmount: string;
  currency: string;
  category?: { name: string };
};

export const DEMO_TENANT_IDS = new Set(['1', '2', '3', '4']);

export function isDemoTenantId(tenantId: string): boolean {
  return DEMO_TENANT_IDS.has(tenantId);
}

/** Seed kiracı slug → offline demo paket anahtarı (1–4) */
const SEED_SLUG_TO_DEMO: Record<string, string> = {
  'ankara-clinic': '1',
  'izmir-beauty': '2',
  'bursa-hospital': '3',
  'istanbul-restaurant': '4',
};

export function slugToDemoTenantId(slug: string | undefined): string | undefined {
  if (!slug) return undefined;
  return SEED_SLUG_TO_DEMO[slug];
}

export function guestDemoBundleTenantId(
  selectedTenantId: string,
  tenants: Array<{ id: string; slug: string }>,
): string | null {
  if (isDemoTenantId(selectedTenantId)) return selectedTenantId;
  const slug = tenants.find((t) => t.id === selectedTenantId)?.slug;
  return slugToDemoTenantId(slug) ?? null;
}

/** API şubeleri tenantId taşır; demo paket şubeleri taşımaz */
export function guestBranchesAreDemoPack(branches: BranchLite[]): boolean {
  if (branches.length === 0) return false;
  return !branches.some((b) => {
    const tid = (b as BranchLite & { tenantId?: string }).tenantId;
    return tid != null && tid !== '';
  });
}

/** Offline demo: restoran (alan bazlı) — API yokken id 4 */
export function isRestaurantDemoTenant(tenantId: string): boolean {
  return tenantId === '4';
}

type DemoStaffDef = {
  id: string;
  name: string;
  role: string;
  /** Haftanın hangi günü izinli (0=Pazar … 6=Cumartesi) */
  weeklyOff: number;
};

type BranchBundle = {
  branch: BranchLite;
  staff: DemoStaffDef[];
  services: ServiceLite[];
};

/** Şirket / şube adları seed + App fallback ile uyumlu; dikeye göre şube etiketi */
const bundlesByTenant: Record<string, BranchBundle[]> = {
  '1': [
    {
      branch: { id: 'b1-ank-hq', name: 'Çankaya Ağız ve Diş Polikliniği · Poliklinik Merkezi', code: 'HQ' },
      staff: [
        { id: 's1-1', name: 'Dr. Selim Yurt', role: 'Diş Hekimi', weeklyOff: 0 },
        { id: 's1-2', name: 'Dr. Ayşe Korkmaz', role: 'Ortodonti', weeklyOff: 3 },
        { id: 's1-3', name: 'Dt. Burak Eren', role: 'Çocuk Diş', weeklyOff: 6 },
      ],
      services: [
        { id: 'svc1-1', name: 'Muayene & Panoramik Röntgen', durationMin: 45, priceAmount: '1850', currency: 'TRY', category: { name: 'Genel' } },
        { id: 'svc1-2', name: 'Dolgu (Kompozit)', durationMin: 60, priceAmount: '3200', currency: 'TRY', category: { name: 'Tedavi' } },
        { id: 'svc1-3', name: 'Diş Taşı Temizliği', durationMin: 40, priceAmount: '1450', currency: 'TRY', category: { name: 'Hijyen' } },
      ],
    },
  ],
  '2': [
    {
      branch: { id: 'b2-izm-hq', name: 'Glow İzmir Güzellik Salonu · Merkez Salon', code: 'HQ' },
      staff: [
        { id: 's2-1', name: 'Deniz Yılmaz', role: 'Saç Tasarım', weeklyOff: 1 },
        { id: 's2-2', name: 'Melis Aktaş', role: 'Boyama Uzmanı', weeklyOff: 0 },
        { id: 's2-3', name: 'Lara Demir', role: 'Cilt Bakımı', weeklyOff: 3 },
      ],
      services: [
        { id: 'svc2-1', name: 'Kesim + Fön', durationMin: 60, priceAmount: '850', currency: 'TRY', category: { name: 'Saç' } },
        { id: 'svc2-2', name: 'Komple Boya & Bakım', durationMin: 120, priceAmount: '2800', currency: 'TRY', category: { name: 'Saç' } },
        { id: 'svc2-3', name: 'Hydrafacial Basic', durationMin: 45, priceAmount: '1950', currency: 'TRY', category: { name: 'Cilt' } },
      ],
    },
  ],
  '3': [
    {
      branch: { id: 'b3-brs-hq', name: 'Bursa Kardiyoloji Polikliniği · Poliklinik Merkezi', code: 'HQ' },
      staff: [
        { id: 's3-1', name: 'Dr. Prof. Hande Er', role: 'Kardiyoloji', weeklyOff: 0 },
        { id: 's3-2', name: 'Dr. Umut Şahin', role: 'Dahiliye', weeklyOff: 2 },
        { id: 's3-3', name: 'Op. Dr. Can Ruhi', role: 'Ortopedi', weeklyOff: 5 },
      ],
      services: [
        { id: 'svc3-1', name: 'Kontrol Muayenesi', durationMin: 25, priceAmount: '750', currency: 'TRY', category: { name: 'Poliklinik' } },
        { id: 'svc3-2', name: 'Efor Testi', durationMin: 45, priceAmount: '2200', currency: 'TRY', category: { name: 'Kardiyo' } },
        { id: 'svc3-3', name: 'MR Görüşü', durationMin: 30, priceAmount: '950', currency: 'TRY', category: { name: 'Radyoloji' } },
      ],
    },
  ],
  /** Restoran: "staff" listesi aslında gelir merkezi alanları (API seed ile aynı 3 alan) */
  '4': [
    {
      branch: { id: 'b4-ist-hq', name: 'Bebek Boğaz Restoran · Ana Restoran', code: 'HQ' },
      staff: [
        { id: 'ra4-garden', name: 'Bahçe', role: 'RC-BAHÇE', weeklyOff: 0 },
        { id: 'ra4-terrace', name: 'Teras', role: 'RC-TERAS', weeklyOff: 1 },
        { id: 'ra4-main', name: 'İç Salon', role: 'RC-İÇ', weeklyOff: 6 },
      ],
      services: [
        { id: 'svc4-1', name: 'Akşam yemeği (2 kişi)', durationMin: 90, priceAmount: '1200', currency: 'TRY', category: { name: 'Menü' } },
        { id: 'svc4-2', name: 'Brunch masası', durationMin: 75, priceAmount: '850', currency: 'TRY', category: { name: 'Menü' } },
        { id: 'svc4-3', name: 'Özel gün menüsü', durationMin: 120, priceAmount: '2100', currency: 'TRY', category: { name: 'Menü' } },
      ],
    },
  ],
};

function getBundles(tenantId: string): BranchBundle[] {
  return bundlesByTenant[tenantId] ?? [];
}

export function getDemoBranches(tenantId: string): BranchLite[] {
  return getBundles(tenantId).map((b) => b.branch);
}

export function getDemoServicesForBranch(tenantId: string, branchId: string): ServiceLite[] {
  const bundle = getBundles(tenantId).find((b) => b.branch.id === branchId);
  return bundle?.services ?? [];
}

function getStaffForBranch(tenantId: string, branchId: string): DemoStaffDef[] {
  const bundle = getBundles(tenantId).find((b) => b.branch.id === branchId);
  return bundle?.staff ?? [];
}

function getServiceDuration(tenantId: string, branchId: string, serviceId: string): number {
  const services = getDemoServicesForBranch(tenantId, branchId);
  const s = services.find((x) => x.id === serviceId);
  return s ? s.durationMin : 30;
}

/** Yerel tarih için haftanın günü (0=Pazar) */
function localWeekday(dateStr: string): number {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d).getDay();
}

function localISO(dateStr: string, hour: number, minute: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d, hour, minute, 0, 0).toISOString();
}

/** Sabah + öğleden sonra vardiyası (öğle arası 12:30–13:30) */
function shiftsForStaff(dateStr: string, offDay: boolean): Array<{ startsAt: string; endsAt: string }> {
  if (offDay) return [];
  return [
    { startsAt: localISO(dateStr, 9, 0), endsAt: localISO(dateStr, 12, 30) },
    { startsAt: localISO(dateStr, 13, 30), endsAt: localISO(dateStr, 18, 0) },
  ];
}

/** Restoran alanı: tek uzun servis penceresi */
function shiftsForRestaurantArea(dateStr: string, offDay: boolean): Array<{ startsAt: string; endsAt: string }> {
  if (offDay) return [];
  return [{ startsAt: localISO(dateStr, 11, 0), endsAt: localISO(dateStr, 22, 30) }];
}

function hashSeed(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i += 1) h = (h << 5) - h + str.charCodeAt(i);
  return Math.abs(h);
}

export type StaffCalendarRow = {
  staffUserId: string;
  staffName: string;
  offDay: boolean;
  shifts: Array<{ startsAt: string; endsAt: string }>;
  bookedCount: number;
  freeCount: number;
};

export type AvailabilitySlot = {
  staffUserId: string;
  staffName: string;
  startsAt: string;
  endsAt: string;
};

export function buildDemoStaffCalendar(input: {
  tenantId: string;
  branchId: string;
  date: string;
  serviceId?: string;
}): StaffCalendarRow[] {
  const staff = getStaffForBranch(input.tenantId, input.branchId);
  const wd = localWeekday(input.date);
  const durationMin = input.serviceId
    ? getServiceDuration(input.tenantId, input.branchId, input.serviceId)
    : 30;

  return staff.map((person) => {
    const offDay = wd === person.weeklyOff;
    const shifts = isRestaurantDemoTenant(input.tenantId)
      ? shiftsForRestaurantArea(input.date, offDay)
      : shiftsForStaff(input.date, offDay);
    let workMin = 0;
    for (const w of shifts) {
      workMin += (new Date(w.endsAt).getTime() - new Date(w.startsAt).getTime()) / 60000;
    }
    const capacitySlots = Math.max(0, Math.floor(workMin / durationMin));
    const seed = hashSeed(`${input.date}-${person.id}`);
    const bookedCount = offDay ? 0 : (seed % Math.min(5, Math.max(1, capacitySlots)));
    const freeCount = Math.max(0, capacitySlots - bookedCount);

    return {
      staffUserId: person.id,
      staffName: `${person.name} (${person.role})`,
      offDay,
      shifts,
      bookedCount,
      freeCount,
    };
  });
}

export function buildDemoAvailability(input: {
  tenantId: string;
  branchId: string;
  serviceId: string;
  date: string;
  staffUserId?: string;
}): AvailabilitySlot[] {
  const durationMin = getServiceDuration(input.tenantId, input.branchId, input.serviceId);
  const calendar = buildDemoStaffCalendar({
    tenantId: input.tenantId,
    branchId: input.branchId,
    date: input.date,
    serviceId: input.serviceId,
  });

  const rows = input.staffUserId ? calendar.filter((c) => c.staffUserId === input.staffUserId) : calendar;
  const slots: AvailabilitySlot[] = [];
  const slotStep = 30;

  for (const row of rows) {
    if (row.offDay) continue;
    const staffPlainName = row.staffName.replace(/\s*\([^)]*\)\s*$/, '').trim();

    for (const win of row.shifts) {
      let cursor = new Date(win.startsAt).getTime();
      const end = new Date(win.endsAt).getTime();
      while (cursor + durationMin * 60 * 1000 <= end) {
        const startsAt = new Date(cursor).toISOString();
        const endsAt = new Date(cursor + durationMin * 60 * 1000).toISOString();
        const slotKey = `${input.date}-${row.staffUserId}-${startsAt}`;
        const h = hashSeed(slotKey);
        const taken = h % 7 === 0;
        if (!taken) {
          slots.push({
            staffUserId: row.staffUserId,
            staffName: staffPlainName,
            startsAt,
            endsAt,
          });
        }
        cursor += slotStep * 60 * 1000;
      }
    }
  }

  return slots.slice(0, 48);
}

export function demoReservationSuccessMessage(lang: 'tr' | 'en'): string {
  return lang === 'tr'
    ? 'Demo: Rezervasyon kaydı simüle edildi (API bağlantısı olmadan).'
    : 'Demo: Reservation simulated (no API).';
}

/**
 * Demo restoran: varsayılan ek rezervasyon ücreti yok (ücretsiz ön rezervasyon).
 * `seed.mjs` ile aynı takvim mantığı: UTC “bugün” + 3 gün (BranchPricingDay.date ile hizalı).
 */
export function getDemoSpecialPricingDateYmd(): string {
  const now = new Date();
  const todaySeed = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const special = new Date(todaySeed.getTime() + 3 * 24 * 60 * 60 * 1000);
  const y = special.getUTCFullYear();
  const m = String(special.getUTCMonth() + 1).padStart(2, '0');
  const day = String(special.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function getDemoPricingHintForDate(date: string): {
  hasRule: boolean;
  label?: string;
  surchargePercent?: number | null;
  extraAmount?: number | null;
  note?: string | null;
} {
  if (!date) return { hasRule: false };
  const special = getDemoSpecialPricingDateYmd();
  if (date === special) {
    return {
      hasRule: true,
      label: 'Özel gün fiyatı',
      surchargePercent: 15,
      extraAmount: null,
      note: 'Demo: Bu tarih için önemli gün kuralı (%15 ek). Diğer günlerde ek ücret yok.',
    };
  }
  return { hasRule: false };
}
