/**
 * Zengin demo veri — API yokken veya demo tenant seçiliyken
 * şube / hizmet / çalışan / vardiya / izin / müsait slot simülasyonu.
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

export const DEMO_TENANT_IDS = new Set(['1', '2', '3']);

export function isDemoTenantId(tenantId: string): boolean {
  return DEMO_TENANT_IDS.has(tenantId);
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

const bundlesByTenant: Record<string, BranchBundle[]> = {
  '1': [
    {
      branch: { id: 'b1-ank-hq', name: 'Çankaya Genel Poliklinik', code: 'ANK-HQ' },
      staff: [
        { id: 's1-1', name: 'Dr. Selim Yurt', role: 'Diş Hekimi', weeklyOff: 0 },
        { id: 's1-2', name: 'Dr. Ayşe Korkmaz', role: 'Ortodonti', weeklyOff: 3 },
        { id: 's1-3', name: 'Dt. Burak Eren', role: 'Çocuk Diş', weeklyOff: 6 },
        { id: 's1-4', name: 'Hemşire Zeynep Ak', role: 'Klinik Koordinasyon', weeklyOff: 0 },
      ],
      services: [
        { id: 'svc1-1', name: 'Muayene & Panoramik Röntgen', durationMin: 45, priceAmount: '1850', currency: 'TRY', category: { name: 'Genel' } },
        { id: 'svc1-2', name: 'Dolgu (Kompozit)', durationMin: 60, priceAmount: '3200', currency: 'TRY', category: { name: 'Tedavi' } },
        { id: 'svc1-3', name: 'Diş Taşı Temizliği', durationMin: 40, priceAmount: '1450', currency: 'TRY', category: { name: 'Hijyen' } },
        { id: 'svc1-4', name: 'İmplant Kontrol', durationMin: 30, priceAmount: '950', currency: 'TRY', category: { name: 'Kontrol' } },
      ],
    },
    {
      branch: { id: 'b1-ank-b', name: 'Balgat Şube', code: 'ANK-B' },
      staff: [
        { id: 's1-5', name: 'Dr. Cem Arslan', role: 'Endodonti', weeklyOff: 1 },
        { id: 's1-6', name: 'Dr. Elif Tan', role: 'Protetik', weeklyOff: 4 },
        { id: 's1-7', name: 'Dt. Murat İpek', role: 'Genel', weeklyOff: 5 },
      ],
      services: [
        { id: 'svc1b-1', name: 'Kanal Tedavisi (Tek Kanal)', durationMin: 90, priceAmount: '6500', currency: 'TRY', category: { name: 'Endo' } },
        { id: 'svc1b-2', name: 'Gece Plağı Ölçü', durationMin: 30, priceAmount: '1200', currency: 'TRY', category: { name: 'Protetik' } },
      ],
    },
    {
      branch: { id: 'b1-ank-c', name: 'Etimesgut Şube', code: 'ANK-E' },
      staff: [
        { id: 's1-8', name: 'Dr. Pınar Su', role: 'Genel', weeklyOff: 2 },
        { id: 's1-9', name: 'Dt. Onur Çelik', role: 'Cerrahi', weeklyOff: 0 },
      ],
      services: [
        { id: 'svc1c-1', name: '20 Dakika Diş Beyazlatma', durationMin: 50, priceAmount: '4200', currency: 'TRY', category: { name: 'Estetik' } },
      ],
    },
  ],
  '2': [
    {
      branch: { id: 'b2-izm-1', name: 'Alsancak Salon', code: 'IZM-A' },
      staff: [
        { id: 's2-1', name: 'Usta Kuaför Deniz Yılmaz', role: 'Saç Tasarım', weeklyOff: 1 },
        { id: 's2-2', name: 'Colorist Melis Aktaş', role: 'Boyama Uzmanı', weeklyOff: 0 },
        { id: 's2-3', name: 'Cilt Uzmanı Lara Demir', role: 'Medikal Estetik', weeklyOff: 3 },
        { id: 's2-4', name: 'Masör Kerem Öz', role: 'Wellness', weeklyOff: 6 },
      ],
      services: [
        { id: 'svc2-1', name: 'Kesim + Fön', durationMin: 60, priceAmount: '850', currency: 'TRY', category: { name: 'Saç' } },
        { id: 'svc2-2', name: 'Komple Boya & Bakım', durationMin: 120, priceAmount: '2800', currency: 'TRY', category: { name: 'Saç' } },
        { id: 'svc2-3', name: 'Hydrafacial Basic', durationMin: 45, priceAmount: '1950', currency: 'TRY', category: { name: 'Cilt' } },
        { id: 'svc2-4', name: 'Manikür & Pedikür', durationMin: 75, priceAmount: '1100', currency: 'TRY', category: { name: 'El & Ayak' } },
      ],
    },
    {
      branch: { id: 'b2-izm-2', name: 'Bornova Şube', code: 'IZM-B' },
      staff: [
        { id: 's2-5', name: 'Barber Ali Koç', role: 'Erkek Bakım', weeklyOff: 0 },
        { id: 's2-6', name: 'Estetisyen Sude Vural', role: 'Kaş & Kirpik', weeklyOff: 4 },
      ],
      services: [
        { id: 'svc2b-1', name: 'Sakal Tasarımı', durationMin: 35, priceAmount: '450', currency: 'TRY', category: { name: 'Erkek' } },
        { id: 'svc2b-2', name: 'Lash Lift', durationMin: 55, priceAmount: '1650', currency: 'TRY', category: { name: 'Göz' } },
      ],
    },
  ],
  '3': [
    {
      branch: { id: 'b3-brs-main', name: 'Merkez Kampüs', code: 'BRS-M' },
      staff: [
        { id: 's3-1', name: 'Dr. Prof. Hande Er', role: 'Kardiyoloji', weeklyOff: 0 },
        { id: 's3-2', name: 'Dr. Umut Şahin', role: 'Dahiliye', weeklyOff: 2 },
        { id: 's3-3', name: 'Op. Dr. Can Ruhi', role: 'Ortopedi', weeklyOff: 5 },
        { id: 's3-4', name: 'Hemşire Ece Nur', role: 'Triyaj', weeklyOff: 1 },
      ],
      services: [
        { id: 'svc3-1', name: 'Kontrol Muayenesi', durationMin: 25, priceAmount: '750', currency: 'TRY', category: { name: 'Poliklinik' } },
        { id: 'svc3-2', name: 'Efor Testi', durationMin: 45, priceAmount: '2200', currency: 'TRY', category: { name: 'Kardiyo' } },
        { id: 'svc3-3', name: 'MR Görüşü (önceden çekilmiş)', durationMin: 30, priceAmount: '950', currency: 'TRY', category: { name: 'Radyoloji' } },
      ],
    },
    {
      branch: { id: 'b3-brs-o', name: 'Osmangazi Poliklinik', code: 'BRS-O' },
      staff: [
        { id: 's3-5', name: 'Dr. İpek Sarı', role: 'Göz Hastalıkları', weeklyOff: 3 },
        { id: 's3-6', name: 'Dr. Barış Gül', role: 'KBB', weeklyOff: 0 },
      ],
      services: [
        { id: 'svc3o-1', name: 'Göz İçi Basınç Ölçümü', durationMin: 20, priceAmount: '550', currency: 'TRY', category: { name: 'Göz' } },
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
    const shifts = shiftsForStaff(input.date, offDay);
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
