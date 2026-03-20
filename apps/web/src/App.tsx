import { type ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Activity,
  ArrowRight,
  Banknote,
  BarChart3,
  BellRing,
  BriefcaseBusiness,
  Building2,
  Calculator,
  CalendarClock,
  Check,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Clock,
  Download,
  RefreshCw,
  UserCircle2,
  LayoutDashboard,
  MapPin,
  Menu,
  MoonStar,
  Package,
  Quote,
  Shield,
  ShieldCheck,
  Sparkles,
  SunMedium,
  UserRoundCheck,
  UserRoundPlus,
  Users,
  Wrench,
} from 'lucide-react';
import { apiGet, apiGetWithHeaders, apiPatch, apiPost } from './core/api/client';
import { translations, type Lang } from './i18n/translations';
import { employeeRows, managerRows } from './mock/dashboardData';
import {
  buildDemoAvailability,
  buildDemoStaffCalendar,
  demoReservationSuccessMessage,
  getDemoBranches,
  getDemoServicesForBranch,
  isDemoTenantId,
} from './mock/demoReservationData';

type TabKey =
  | 'overview'
  | 'showcase'
  | 'billing'
  | 'operations'
  | 'guests'
  | 'employees'
  | 'managers'
  | 'companyRoles'
  | 'franchiseRoles'
  | 'subRoles'
  | 'services'
  | 'assignment'
  | 'accounting'
  | 'saasPlans';
type Overview = { tenants: number; activeSubscriptions: number; totalPaidAmount: string | number; superAdmins: number };
type TenantSummary = { id: string; name: string; slug: string; vertical: 'BEAUTY' | 'HEALTH'; branches: number; subscriptionStatus: string; planName: string };
type Plan = {
  id: string;
  name: string;
  code: string;
  priceAmount: string;
  interval: 'MONTHLY' | 'YEARLY';
  maxBranches: number;
  maxStaff: number;
  description?: string | null;
  trialDays?: number;
  maxAppointmentsMo?: number;
  sortOrder?: number;
  badgeLabel?: string | null;
  stripePriceId?: string | null;
  featureLines?: unknown;
  isActive?: boolean;
};
type PlatformBankAccount = {
  id: string;
  label: string;
  bankName: string;
  accountHolder: string;
  iban: string;
  swift?: string | null;
  currency: string;
  sortOrder: number;
  isActive: boolean;
};
type RecentPayment = { id: string; amount: string; status: string; subscription: { tenant: { name: string }; plan: { name: string } } };
type DevProfile = 'superAdmin' | 'companyManager' | 'franchiseManager' | 'employee' | 'guest';
type BranchLite = { id: string; name: string; code: string };
type ServiceLite = { id: string; name: string; durationMin: number; priceAmount: string; currency: string; category?: { name: string } };
type AvailabilitySlot = { staffUserId: string; staffName: string; startsAt: string; endsAt: string };
type LedgerEntry = { id: string; createdAt: string; type: string; description?: string; amount: string; currency: string };
type NotificationRow = { id: string; action: string; createdAt: string; metadata?: { customerName?: string; toStatus?: string } };
type ReservationRow = {
  id: string;
  status: string;
  startsAt: string;
  customer: { fullName: string };
  service: { name: string };
  staffUser: { fullName: string };
  branch: { name: string };
};
type ReservationStatusFilter = 'ALL' | 'PENDING' | 'CONFIRMED' | 'IN_PROGRESS' | 'COMPLETED';
type LedgerTypeFilter = 'ALL' | 'INCOME' | 'CASH_IN';
type Vertical = 'BEAUTY' | 'HEALTH';
type RoleRow = { id: string; code: string; name: string; description?: string };
type StaffCalendarRow = {
  staffUserId: string;
  staffName: string;
  offDay: boolean;
  shifts: Array<{ startsAt: string; endsAt: string }>;
  bookedCount: number;
  freeCount: number;
};

function pad2(n: number) {
  return String(n).padStart(2, '0');
}
function todayISODate() {
  const t = new Date();
  return `${t.getFullYear()}-${pad2(t.getMonth() + 1)}-${pad2(t.getDate())}`;
}
/** Pazartesi başlangıçlı 7 gün */
function weekStripFromDate(dateStr: string, locale: string) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const base = new Date(y, m - 1, d);
  const wd = base.getDay();
  const mondayOffset = wd === 0 ? -6 : 1 - wd;
  const start = new Date(base);
  start.setDate(base.getDate() + mondayOffset);
  const days: { iso: string; dayShort: string; dayNum: number }[] = [];
  for (let i = 0; i < 7; i += 1) {
    const dt = new Date(start);
    dt.setDate(start.getDate() + i);
    const iso = `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())}`;
    days.push({
      iso,
      dayShort: dt.toLocaleDateString(locale, { weekday: 'short' }),
      dayNum: dt.getDate(),
    });
  }
  return days;
}

function shiftDateByDays(iso: string, delta: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + delta);
  return `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())}`;
}

function groupSlotsByPeriod(slots: AvailabilitySlot[]) {
  const morning: AvailabilitySlot[] = [];
  const afternoon: AvailabilitySlot[] = [];
  const evening: AvailabilitySlot[] = [];
  for (const s of slots) {
    const h = new Date(s.startsAt).getHours();
    if (h < 12) morning.push(s);
    else if (h < 17) afternoon.push(s);
    else evening.push(s);
  }
  return { morning, afternoon, evening };
}

function recommendPlanCode(
  plans: Plan[],
  applicationType: 'company' | 'franchise',
  needs: {
    branchScale: '1' | '2-5' | '5+';
    teamScale: 'small' | 'medium' | 'large';
    modules: { franchise: boolean };
  },
): string {
  if (plans.length === 0) return '';
  const byCode = (code: string) => plans.find((p) => p.code === code);
  const last = plans[plans.length - 1];
  if (applicationType === 'franchise') return byCode('ENTERPRISE_YEARLY')?.code ?? last.code;
  if (needs.branchScale === '5+' || needs.modules.franchise) return byCode('ENTERPRISE_YEARLY')?.code ?? last.code;
  if (needs.branchScale === '2-5' || needs.teamScale === 'medium' || needs.teamScale === 'large') {
    return byCode('GROWTH_MONTHLY')?.code ?? (plans[1]?.code ?? plans[0].code);
  }
  return byCode('STARTER_MONTHLY')?.code ?? plans[0].code;
}

const fallbackOverview: Overview = { tenants: 12, activeSubscriptions: 9, totalPaidAmount: '124000', superAdmins: 2 };
const fallbackTenants: TenantSummary[] = [
  { id: '1', name: 'Ankara Smile Clinic', slug: 'ankara-clinic', vertical: 'HEALTH', branches: 3, subscriptionStatus: 'ACTIVE', planName: 'Growth' },
  { id: '2', name: 'Izmir Beauty Lounge', slug: 'izmir-beauty', vertical: 'BEAUTY', branches: 2, subscriptionStatus: 'TRIAL', planName: 'Starter' },
  { id: '3', name: 'Bursa Med Center', slug: 'bursa-hospital', vertical: 'HEALTH', branches: 5, subscriptionStatus: 'PAST_DUE', planName: 'Enterprise' },
];

/** API kapalıyken anasayfa / başvuru paketleri (kodlar seed ile uyumlu) */
const FALLBACK_PLANS: Plan[] = [
  {
    id: 'fb-starter',
    code: 'STARTER_MONTHLY',
    name: 'Salon & Studio',
    priceAmount: '1299',
    interval: 'MONTHLY',
    maxBranches: 2,
    maxStaff: 18,
    description: 'Güzellik, berber, nail ve tek şube işletmeleri için giriş paketi.',
    trialDays: 14,
    maxAppointmentsMo: 3500,
    sortOrder: 1,
    badgeLabel: 'Başlangıç',
    featureLines: [
      'Güzellik salonu, barber, nail: tek–çift şube',
      'Misafir rezervasyonu, çalışan takvimi, bildirimler',
      'Ön muhasebe / kasa kayıtları (paket kotasına göre)',
    ],
  },
  {
    id: 'fb-growth',
    code: 'GROWTH_MONTHLY',
    name: 'Klinik & Operasyon',
    priceAmount: '3499',
    interval: 'MONTHLY',
    maxBranches: 12,
    maxStaff: 90,
    description: 'Sağlık, diş ve çok şubeli klinikler için operasyon odağı.',
    trialDays: 14,
    maxAppointmentsMo: 30000,
    sortOrder: 2,
    badgeLabel: 'En çok tercih edilen',
    featureLines: [
      'Klinik & çok şube: şube bazlı hizmet ve roller',
      'Operasyon ekranı, atama, durum akışı',
      'Raporlama ve SaaS faturalama entegrasyonuna hazır',
    ],
  },
  {
    id: 'fb-ent',
    code: 'ENTERPRISE_YEARLY',
    name: 'Zincir & Franchise',
    priceAmount: '34999',
    interval: 'YEARLY',
    maxBranches: 999,
    maxStaff: 9999,
    description: 'Ülke çapı zincir, hastane grupları ve franchise yönetimi.',
    trialDays: 30,
    maxAppointmentsMo: 500000,
    sortOrder: 3,
    badgeLabel: 'Kurumsal',
    featureLines: [
      'Franchise / zincir: sınırsız şube kotası',
      'Kurumsal SLA, özel entegrasyon ve veri izolasyonu',
      'Havale/EFT + Stripe ile tahsilat (platform hesapları)',
    ],
  },
];

function planFeatureLines(
  plan: Plan,
  t: { landingPlanFeature1: string; landingPlanFeature2: string; landingPlanFeature3: string },
): string[] {
  if (plan.featureLines != null && Array.isArray(plan.featureLines)) {
    return plan.featureLines.filter((x): x is string => typeof x === 'string');
  }
  return [t.landingPlanFeature1, t.landingPlanFeature2, t.landingPlanFeature3];
}
export function App() {
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [lang, setLang] = useState<Lang>('tr');
  const [tab, setTab] = useState<TabKey>('overview');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [employeeModalOpen, setEmployeeModalOpen] = useState(false);
  const [overview, setOverview] = useState<Overview>(fallbackOverview);
  const [tenants, setTenants] = useState<TenantSummary[]>(fallbackTenants);
  const [plans, setPlans] = useState<Plan[]>(FALLBACK_PLANS);
  const [payments, setPayments] = useState<RecentPayment[]>([]);
  const [platformBanks, setPlatformBanks] = useState<PlatformBankAccount[]>([]);
  const [adminPlans, setAdminPlans] = useState<Plan[]>([]);
  const [adminBanks, setAdminBanks] = useState<PlatformBankAccount[]>([]);
  const [localPlans, setLocalPlans] = useState<Plan[]>([]);
  const [localBanks, setLocalBanks] = useState<PlatformBankAccount[]>([]);
  const [newEmployee, setNewEmployee] = useState({ name: '', email: '', role: '', branch: '' });
  const [devProfile, setDevProfile] = useState<DevProfile>('superAdmin');
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [selectedTenantId, setSelectedTenantId] = useState<string>('');
  const [branches, setBranches] = useState<BranchLite[]>([]);
  const [serviceForm, setServiceForm] = useState({
    branchId: '',
    categoryName: 'Beauty Core',
    name: '',
    durationMin: 30,
    priceAmount: 0,
    currency: '',
  });
  const [currencyForm, setCurrencyForm] = useState('TRY');
  const [guestForm, setGuestForm] = useState({
    branchId: '',
    serviceId: '',
    customerName: '',
    customerPhone: '',
    customerEmail: '',
    date: '',
    staffUserId: '',
  });
  const [availability, setAvailability] = useState<AvailabilitySlot[]>([]);
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  const [cashInForm, setCashInForm] = useState({ amount: 0, currency: 'TRY', description: '' });
  const [selectedSubscriptionId, setSelectedSubscriptionId] = useState('');
  const [branchServices, setBranchServices] = useState<ServiceLite[]>([]);
  const [reservations, setReservations] = useState<ReservationRow[]>([]);
  const [reservationStatusFilter, setReservationStatusFilter] = useState<ReservationStatusFilter>('ALL');
  const [ledgerTypeFilter, setLedgerTypeFilter] = useState<LedgerTypeFilter>('ALL');
  const [selectedStaffId, setSelectedStaffId] = useState('');
  const [loading, setLoading] = useState(false);
  const [staffCalendar, setStaffCalendar] = useState<StaffCalendarRow[]>([]);
  const [roles, setRoles] = useState<RoleRow[]>([]);
  const [onboardForm, setOnboardForm] = useState({
    companyName: '',
    slug: '',
    vertical: 'BEAUTY' as Vertical,
    adminFullName: '',
    adminEmail: '',
    planCode: '',
    defaultCurrency: 'TRY',
  });
  const [roleForm, setRoleForm] = useState({ code: '', name: '', description: '' });
  const [applicationType, setApplicationType] = useState<'company' | 'franchise'>('company');
  const [applyStep, setApplyStep] = useState(1);
  const [applyNeeds, setApplyNeeds] = useState({
    branchScale: '1' as '1' | '2-5' | '5+',
    teamScale: 'small' as 'small' | 'medium' | 'large',
    modules: { reservations: true, multiBranch: false, franchise: false, accounting: true },
  });
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [applyNotes, setApplyNotes] = useState('');
  const [applySubmitting, setApplySubmitting] = useState(false);
  const [actionMessage, setActionMessage] = useState('');
  const [publicNavOpen, setPublicNavOpen] = useState(false);
  const [customerNotifs, setCustomerNotifs] = useState<NotificationRow[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const isAdminPath = location.pathname.startsWith('/app');

  const t = translations[lang];

  const recommendedPlanCode = useMemo(
    () => recommendPlanCode(plans, applicationType, applyNeeds),
    [plans, applicationType, applyNeeds],
  );
  const applyFeaturedPlanIdx = useMemo(() => (plans.length ? Math.floor((plans.length - 1) / 2) : 0), [plans.length]);
  const ledgerSummary = useMemo(() => {
    let income = 0;
    let cashIn = 0;
    for (const row of ledger) {
      const n = Number(row.amount);
      if (row.type === 'INCOME') income += n;
      else if (row.type === 'CASH_IN') cashIn += n;
    }
    return { income, cashIn, total: income + cashIn, count: ledger.length };
  }, [ledger]);
  const roleHint = useMemo(() => {
    const m: Record<DevProfile, string> = {
      superAdmin: t.roleHintSuperAdmin,
      companyManager: t.roleHintCompanyManager,
      franchiseManager: t.roleHintFranchiseManager,
      employee: t.roleHintEmployee,
      guest: t.roleHintGuest,
    };
    return m[devProfile];
  }, [
    devProfile,
    t.roleHintSuperAdmin,
    t.roleHintCompanyManager,
    t.roleHintFranchiseManager,
    t.roleHintEmployee,
    t.roleHintGuest,
  ]);

  const ledgerRowLabel = (type: string) => {
    if (type === 'INCOME') return t.ledgerTypeIncome;
    if (type === 'CASH_IN') return t.ledgerTypeCashIn;
    return type;
  };

  const exportLedgerCsv = () => {
    if (ledger.length === 0 || !selectedTenantId) return;
    const lines = [['date', 'type', 'description', 'amount', 'currency'].join(',')];
    for (const r of ledger) {
      lines.push(
        [
          new Date(r.createdAt).toISOString(),
          r.type,
          `"${(r.description ?? '').replace(/"/g, '""')}"`,
          r.amount,
          r.currency,
        ].join(','),
      );
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ledger-${selectedTenantId.slice(0, 8)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const reserveWeekDays = useMemo(() => {
    if (!guestForm.date) return [];
    return weekStripFromDate(guestForm.date, lang === 'tr' ? 'tr-TR' : 'en-US');
  }, [guestForm.date, lang]);

  useEffect(() => {
    if (location.pathname !== '/reserve') return;
    setGuestForm((prev) => (prev.date ? prev : { ...prev, date: todayISODate() }));
  }, [location.pathname]);

  useEffect(() => {
    if (!isAdminPath || tab !== 'guests') return;
    setGuestForm((prev) => (prev.date ? prev : { ...prev, date: todayISODate() }));
  }, [isAdminPath, tab]);

  useEffect(() => {
    const saved = window.localStorage.getItem('app-theme');
    if (saved === 'dark' || saved === 'light') {
      setTheme(saved);
    }
  }, []);

  useEffect(() => {
    const resolvedTheme = isAdminPath ? theme : 'light';
    document.documentElement.setAttribute('data-theme', resolvedTheme);
    if (isAdminPath) {
      window.localStorage.setItem('app-theme', theme);
    }
  }, [theme, isAdminPath]);

  useEffect(() => {
    if (!isAdminPath && location.hash) {
      const id = location.hash.replace('#', '');
      const el = document.getElementById(id);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }
  }, [isAdminPath, location.hash]);

  useEffect(() => {
    setPublicNavOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (location.pathname !== '/apply') {
      setApplyStep(1);
      setTermsAccepted(false);
    }
  }, [location.pathname]);

  useEffect(() => {
    if (location.pathname !== '/apply') return;
    const p = searchParams.get('plan');
    if (p && plans.some((pl) => pl.code === p)) {
      setOnboardForm((s) => ({ ...s, planCode: p }));
    }
  }, [location.pathname, searchParams, plans]);

  useEffect(() => {
    if (!isAdminPath || location.pathname !== '/app/overview') return;
    const pending = sessionStorage.getItem('pendingDevProfile');
    if (!pending) return;
    const allowed: DevProfile[] = ['superAdmin', 'companyManager', 'franchiseManager', 'employee', 'guest'];
    if (allowed.includes(pending as DevProfile)) {
      setDevProfile(pending as DevProfile);
      setIsLoggedIn(true);
    }
    sessionStorage.removeItem('pendingDevProfile');
  }, [isAdminPath, location.pathname]);

  useEffect(() => {
    const onReservePage = !isAdminPath && location.pathname === '/reserve';
    const onAdminGuests = isAdminPath && tab === 'guests';
    if (!onReservePage && !onAdminGuests) return;
    if (!selectedTenantId || !guestForm.branchId || !guestForm.date) {
      setStaffCalendar([]);
      return;
    }
    if (isDemoTenantId(selectedTenantId)) {
      setStaffCalendar(
        buildDemoStaffCalendar({
          tenantId: selectedTenantId,
          branchId: guestForm.branchId,
          date: guestForm.date,
          serviceId: guestForm.serviceId || undefined,
        }),
      );
      return;
    }
    async function loadCal() {
      try {
        const q = guestForm.serviceId ? `&serviceId=${encodeURIComponent(guestForm.serviceId)}` : '';
        const rows = await apiGetWithHeaders<StaffCalendarRow[]>(
          `/guest/staff-calendar?branchId=${encodeURIComponent(guestForm.branchId)}&date=${encodeURIComponent(guestForm.date)}${q}`,
          { 'x-tenant-id': selectedTenantId },
        );
        setStaffCalendar(rows);
      } catch {
        setStaffCalendar([]);
      }
    }
    void loadCal();
  }, [isAdminPath, location.pathname, tab, selectedTenantId, guestForm.branchId, guestForm.date, guestForm.serviceId]);

  const refreshSlots = useCallback(async () => {
    if (!selectedTenantId || !guestForm.branchId || !guestForm.serviceId || !guestForm.date) return;
    setSlotsLoading(true);
    try {
      if (isDemoTenantId(selectedTenantId)) {
        setAvailability(
          buildDemoAvailability({
            tenantId: selectedTenantId,
            branchId: guestForm.branchId,
            serviceId: guestForm.serviceId,
            date: guestForm.date,
            staffUserId: guestForm.staffUserId || undefined,
          }),
        );
      } else {
        const qs = new URLSearchParams({
          branchId: guestForm.branchId,
          serviceId: guestForm.serviceId,
          date: guestForm.date,
        });
        if (guestForm.staffUserId) qs.set('staffUserId', guestForm.staffUserId);
        const rows = await apiGetWithHeaders<AvailabilitySlot[]>(
          `/guest/availability?${qs.toString()}`,
          { 'x-tenant-id': selectedTenantId },
        );
        setAvailability(rows);
      }
    } catch {
      setAvailability([]);
    } finally {
      setSlotsLoading(false);
    }
  }, [selectedTenantId, guestForm.branchId, guestForm.serviceId, guestForm.date, guestForm.staffUserId]);

  useEffect(() => {
    const ctx = location.pathname === '/reserve' || (isAdminPath && tab === 'guests');
    if (!ctx) return;
    if (!selectedTenantId || !guestForm.branchId || !guestForm.serviceId || !guestForm.date) {
      setAvailability([]);
      return;
    }
    const id = window.setTimeout(() => {
      void refreshSlots();
    }, 420);
    return () => window.clearTimeout(id);
  }, [
    location.pathname,
    isAdminPath,
    tab,
    selectedTenantId,
    guestForm.branchId,
    guestForm.serviceId,
    guestForm.date,
    guestForm.staffUserId,
    refreshSlots,
  ]);

  useEffect(() => {
    async function load() {
      try {
        const [ov, ts, ps, rp] = await Promise.all([
          apiGet<Overview>('/platform/overview'),
          apiGet<TenantSummary[]>('/platform/tenants-summary'),
          apiGet<Plan[]>('/saas/plans'),
          apiGet<RecentPayment[]>('/platform/recent-payments'),
        ]);
        setOverview(ov);
        setTenants(ts);
        setPlans(ps.length > 0 ? ps : FALLBACK_PLANS);
        setPayments(rp);
      } catch {
        setPlans(FALLBACK_PLANS);
      }
      try {
        const banks = await apiGet<PlatformBankAccount[]>('/saas/bank-accounts');
        setPlatformBanks(Array.isArray(banks) ? banks : []);
      } catch {
        setPlatformBanks([]);
      }
    }
    load();
  }, []);

  useEffect(() => {
    if (!isAdminPath || tab !== 'saasPlans' || devProfile !== 'superAdmin') return;
    async function loadAdmin() {
      try {
        const [p, b] = await Promise.all([
          apiGet<Plan[]>('/platform/plans'),
          apiGet<PlatformBankAccount[]>('/platform/bank-accounts'),
        ]);
        setAdminPlans(p);
        setAdminBanks(b);
      } catch {
        setAdminPlans(FALLBACK_PLANS);
        setAdminBanks([]);
      }
    }
    void loadAdmin();
  }, [isAdminPath, tab, devProfile]);

  useEffect(() => {
    setLocalPlans(adminPlans);
  }, [adminPlans]);

  useEffect(() => {
    setLocalBanks(adminBanks);
  }, [adminBanks]);

  const kpis = useMemo(
    () => [
      { label: t.totalTenants, value: String(overview.tenants), delta: t.thisWeekGrowth },
      { label: t.activeSubscriptions, value: String(overview.activeSubscriptions), delta: t.healthyGrowth },
      { label: t.totalPaid, value: `₺${overview.totalPaidAmount}`, delta: t.saasRevenue },
      { label: t.superAdmins, value: String(overview.superAdmins), delta: t.platformControl },
    ],
    [overview, t.totalTenants, t.activeSubscriptions, t.totalPaid, t.superAdmins, t.thisWeekGrowth, t.healthyGrowth, t.saasRevenue, t.platformControl],
  );

  const pathByTab: Record<TabKey, string> = {
    overview: '/app/overview',
    showcase: '/app/showcase',
    billing: '/app/billing',
    operations: '/app/operations',
    guests: '/app/guests',
    employees: '/app/employees',
    managers: '/app/managers',
    companyRoles: '/app/roles/company',
    franchiseRoles: '/app/roles/franchise',
    subRoles: '/app/roles/sub',
    services: '/app/services',
    assignment: '/app/assignments',
    accounting: '/app/accounting',
    saasPlans: '/app/saas-plans',
  };
  const tabByPath = Object.entries(pathByTab).reduce((acc, [k, v]) => ({ ...acc, [v]: k as TabKey }), {} as Record<string, TabKey>);
  const iconByTab: Record<TabKey, ReactNode> = {
    overview: <LayoutDashboard size={16} />,
    showcase: <LayoutDashboard size={16} />,
    billing: <Banknote size={16} />,
    operations: <Activity size={16} />,
    guests: <UserRoundPlus size={16} />,
    employees: <Users size={16} />,
    managers: <UserRoundCheck size={16} />,
    companyRoles: <ShieldCheck size={16} />,
    franchiseRoles: <Building2 size={16} />,
    subRoles: <BriefcaseBusiness size={16} />,
    services: <Wrench size={16} />,
    assignment: <ClipboardList size={16} />,
    accounting: <Banknote size={16} />,
    saasPlans: <Package size={16} />,
  };
  const allowedTabsByRole: Record<DevProfile, TabKey[]> = {
    superAdmin: ['showcase', 'overview', 'billing', 'operations', 'guests', 'employees', 'managers', 'companyRoles', 'franchiseRoles', 'subRoles', 'services', 'assignment', 'accounting', 'saasPlans'],
    companyManager: ['showcase', 'overview', 'billing', 'operations', 'employees', 'managers', 'companyRoles', 'services', 'assignment', 'accounting'],
    franchiseManager: ['showcase', 'overview', 'operations', 'employees', 'managers', 'franchiseRoles', 'services', 'assignment', 'accounting'],
    employee: ['showcase', 'overview', 'operations', 'guests', 'assignment'],
    guest: ['showcase', 'overview', 'billing', 'guests'],
  };
  const visibleTabs: TabKey[] = isLoggedIn ? allowedTabsByRole[devProfile] : ['showcase', 'overview', 'billing', 'guests'];

  useEffect(() => {
    const mapped = tabByPath[location.pathname];
    if (mapped && mapped !== tab) {
      setTab(mapped);
    }
  }, [location.pathname]);

  useEffect(() => {
    if (!visibleTabs.includes(tab)) {
      const nextTab = visibleTabs[0];
      setTab(nextTab);
      navigate(pathByTab[nextTab]);
    }
  }, [tab, visibleTabs, navigate]);

  const onTabChange = (next: TabKey) => {
    setTab(next);
    navigate(pathByTab[next]);
  };

  useEffect(() => {
    if (tenants.length > 0 && !selectedTenantId) {
      setSelectedTenantId(tenants[0].id);
    }
  }, [tenants, selectedTenantId]);

  useEffect(() => {
    async function loadBranches() {
      if (!selectedTenantId) return;
      if (isDemoTenantId(selectedTenantId)) {
        const demo = getDemoBranches(selectedTenantId);
        setBranches(demo);
        if (demo[0]) {
          setServiceForm((prev) => ({ ...prev, branchId: demo[0].id }));
          setGuestForm((prev) => ({
            ...prev,
            branchId: demo.some((b) => b.id === prev.branchId) ? prev.branchId : demo[0].id,
          }));
        }
        return;
      }
      try {
        const rows = await apiGetWithHeaders<BranchLite[]>('/branches', { 'x-tenant-id': selectedTenantId });
        setBranches(rows);
        if (rows[0]) {
          setServiceForm((prev) => ({ ...prev, branchId: rows[0].id }));
          setGuestForm((prev) => ({ ...prev, branchId: prev.branchId || rows[0].id }));
        }
      } catch {
        // Keep UI usable if endpoint is unavailable.
      }
    }
    loadBranches();
  }, [selectedTenantId]);

  useEffect(() => {
    async function loadServicesAndLedger() {
      if (!selectedTenantId || !guestForm.branchId) return;
      if (isDemoTenantId(selectedTenantId)) {
        const rows = getDemoServicesForBranch(selectedTenantId, guestForm.branchId);
        setBranchServices(rows);
        setGuestForm((prev) => {
          const ok = rows.some((s) => s.id === prev.serviceId);
          const nextSid = ok ? prev.serviceId : (rows[0]?.id ?? '');
          if (nextSid === prev.serviceId) return prev;
          return { ...prev, serviceId: nextSid };
        });
      } else {
        try {
          const rows = await apiGetWithHeaders<ServiceLite[]>(`/services?branchId=${guestForm.branchId}`, { 'x-tenant-id': selectedTenantId });
          setBranchServices(rows);
          if (rows[0] && !guestForm.serviceId) {
            setGuestForm((prev) => ({ ...prev, serviceId: rows[0].id }));
          }
        } catch {
          setBranchServices([]);
        }
      }
      const reservationQuery = reservationStatusFilter === 'ALL' ? '' : `?status=${reservationStatusFilter}`;
      const ledgerQuery = ledgerTypeFilter === 'ALL' ? '' : `?type=${ledgerTypeFilter}`;
      if (!isDemoTenantId(selectedTenantId)) {
        try {
          const ledgerRows = await apiGetWithHeaders<LedgerEntry[]>(`/accounting/ledger${ledgerQuery}`, { 'x-tenant-id': selectedTenantId });
          setLedger(ledgerRows);
        } catch {
          setLedger([]);
        }
        try {
          const reservationRows = await apiGetWithHeaders<ReservationRow[]>(`/employee/reservations${reservationQuery}`, { 'x-tenant-id': selectedTenantId });
          setReservations(reservationRows);
        } catch {
          setReservations([]);
        }
        try {
          const roleRows = await apiGetWithHeaders<RoleRow[]>('/tenants/roles', { 'x-tenant-id': selectedTenantId });
          setRoles(roleRows);
        } catch {
          setRoles([]);
        }
      } else {
        setLedger([]);
        setReservations([]);
        setRoles([]);
      }
    }
    loadServicesAndLedger();
  }, [selectedTenantId, guestForm.branchId, guestForm.serviceId, reservationStatusFilter, ledgerTypeFilter]);

  const selectedTenant = tenants.find((x) => x.id === selectedTenantId);
  const actorEmail = selectedTenant ? `owner@${selectedTenant.slug}.com` : 'owner@demo-tenant.com';

  const slotGroups = useMemo(() => groupSlotsByPeriod(availability), [availability]);

  const bookingStep = useMemo(() => {
    if (!guestForm.branchId) return 1;
    if (!guestForm.serviceId) return 2;
    if (!guestForm.date) return 3;
    return 4;
  }, [guestForm.branchId, guestForm.serviceId, guestForm.date]);

  const handleBookSlotPublic = useCallback(
    async (slot: AvailabilitySlot) => {
      if (!selectedTenantId) return;
      if (!guestForm.customerName.trim() || !guestForm.customerPhone.trim()) {
        setActionMessage(t.invalidForm);
        document.getElementById('booking-contact')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
      }
      if (isDemoTenantId(selectedTenantId)) {
        setActionMessage(`${t.reserveSuccess} ${demoReservationSuccessMessage(lang)}`);
        setCustomerNotifs((prev) => [
          {
            id: `demo-${Date.now()}`,
            action: 'GUEST_RESERVATION_CREATED',
            createdAt: new Date().toISOString(),
            metadata: { toStatus: 'PENDING', customerName: guestForm.customerName },
          },
          ...prev,
        ]);
        return;
      }
      try {
        await apiPost(
          '/guest/reservations',
          {
            branchId: guestForm.branchId,
            customerName: guestForm.customerName,
            customerPhone: guestForm.customerPhone,
            customerEmail: guestForm.customerEmail.trim() || undefined,
            serviceId: guestForm.serviceId,
            staffUserId: slot.staffUserId,
            createdByEmail: actorEmail,
            startsAt: slot.startsAt,
          },
          { 'x-tenant-id': selectedTenantId },
        );
        setActionMessage(t.reserveSuccess);
        const nq = new URLSearchParams();
        if (guestForm.customerPhone) nq.set('phone', guestForm.customerPhone);
        if (guestForm.customerEmail) nq.set('email', guestForm.customerEmail.trim().toLowerCase());
        if (guestForm.customerPhone || guestForm.customerEmail) {
          const rows = await apiGetWithHeaders<NotificationRow[]>(
            `/guest/customer-notifications?${nq.toString()}`,
            { 'x-tenant-id': selectedTenantId },
          );
          setCustomerNotifs(rows);
        }
      } catch {
        setActionMessage(t.reserveFail);
      }
    },
    [
      selectedTenantId,
      actorEmail,
      lang,
      guestForm.branchId,
      guestForm.customerName,
      guestForm.customerPhone,
      guestForm.customerEmail,
      guestForm.serviceId,
      t.reserveSuccess,
      t.reserveFail,
      t.invalidForm,
    ],
  );

  const profileLabel: Record<DevProfile, string> = {
    superAdmin: t.superAdminProfile,
    companyManager: t.companyManagerProfile,
    franchiseManager: t.franchiseManagerProfile,
    employee: t.employeeProfile,
    guest: t.guestProfile,
  };
  const staffOptions = useMemo(
    () => Array.from(new Map(availability.map((slot) => [slot.staffUserId, { id: slot.staffUserId, name: slot.staffName }])).values()),
    [availability],
  );
  const canApprove = (status: string) => status === 'PENDING';
  const canStart = (status: string) => status === 'CONFIRMED';
  const canComplete = (status: string) => status === 'IN_PROGRESS';
  const selectedPlan = plans.find((p) => p.code === onboardForm.planCode) ?? plans[0];
  const heroSlides = [
    {
      image: '/images/hero-main.jpg',
      title: t.publicHeroTitle,
      desc: t.publicHeroDesc,
    },
    {
      image: '/images/feature-clinic.jpg',
      title: t.featureOps,
      desc: t.featureFinance,
    },
    {
      image: '/images/feature-salon.jpg',
      title: t.featureMultiTenant,
      desc: t.statSupport,
    },
  ];
  const [activeSlide, setActiveSlide] = useState(0);

  useEffect(() => {
    if (isAdminPath) return;
    const timer = window.setInterval(() => {
      setActiveSlide((prev) => (prev + 1) % heroSlides.length);
    }, 4500);
    return () => window.clearInterval(timer);
  }, [isAdminPath, heroSlides.length]);

  if (!isAdminPath) {
    const goPublic = (path: string) => {
      navigate(path);
      setPublicNavOpen(false);
    };
    const goToAppWithRole = (profile: DevProfile) => {
      sessionStorage.setItem('pendingDevProfile', profile);
      navigate('/app/overview');
      setPublicNavOpen(false);
    };

    const activeHero = heroSlides[activeSlide];
    const featuredPlanIdx = plans.length ? Math.floor((plans.length - 1) / 2) : 0;
    const footerYear = new Date().getFullYear();
    const serviceItems = [
      { Icon: CalendarClock, title: t.landingSvc1t, desc: t.landingSvc1d },
      { Icon: Building2, title: t.landingSvc2t, desc: t.landingSvc2d },
      { Icon: Shield, title: t.landingSvc3t, desc: t.landingSvc3d },
      { Icon: BarChart3, title: t.landingSvc4t, desc: t.landingSvc4d },
      { Icon: BellRing, title: t.landingSvc5t, desc: t.landingSvc5d },
      { Icon: Banknote, title: t.landingSvc6t, desc: t.landingSvc6d },
    ];
    const howSteps = [
      { n: '01', title: t.landingHow1t, desc: t.landingHow1d },
      { n: '02', title: t.landingHow2t, desc: t.landingHow2d },
      { n: '03', title: t.landingHow3t, desc: t.landingHow3d },
    ];
    const trustStats = [
      { label: t.landingStat1, value: '%99.9' },
      { label: t.landingStat2, value: `${Math.max(overview.tenants, 1)}+` },
      { label: t.landingStat3, value: 'SLA' },
      { label: t.landingStat4, value: `${Math.max(overview.activeSubscriptions, 1)}+` },
    ];
    const branchPoints = [t.landingBranchPoint1, t.landingBranchPoint2, t.landingBranchPoint3];

    return (
      <main className="publicShell">
        <header className="publicStickyHeader">
          <div className="publicHeaderInner">
            <button type="button" className="publicBrand publicBrandBtn" onClick={() => goPublic('/')}>
              <img src="/images/feature-salon.jpg" alt="" />
              <div>
                <h1>{t.appTitle}</h1>
                <p>{t.brandTagline}</p>
              </div>
            </button>
            <button type="button" className="publicNavToggle" aria-label={t.menu} onClick={() => setPublicNavOpen((v) => !v)}>
              <Menu size={22} />
            </button>
            <nav className={`publicNav ${publicNavOpen ? 'isOpen' : ''}`}>
              <button type="button" className="ghostBtn" onClick={() => goPublic('/')}>{t.navHome}</button>
              <button type="button" className="ghostBtn" onClick={() => goPublic('/#services')}>{t.navServices}</button>
              <button type="button" className="ghostBtn" onClick={() => goPublic('/#pricing')}>{t.navPricing}</button>
              <button type="button" className="ghostBtn" onClick={() => goPublic('/#references')}>{t.navReferences}</button>
              <button type="button" className="ghostBtn" onClick={() => goPublic('/reserve')}>{t.navReserve}</button>
              <button type="button" className="ghostBtn" onClick={() => goPublic('/apply')}>{t.navApply}</button>
              <button type="button" className="ghostBtn" onClick={() => goPublic('/#faq')}>{t.navFaq}</button>
            </nav>
            <div className="publicHeaderEnd">
              <details className="publicRolePanel">
                <summary className="publicRoleSummary">{t.panelLogin}</summary>
                <div className="publicRoleList">
                  <button type="button" className="ghostBtn" onClick={() => goToAppWithRole('superAdmin')}>{t.superAdminProfile}</button>
                  <button type="button" className="ghostBtn" onClick={() => goToAppWithRole('companyManager')}>{t.companyManagerProfile}</button>
                  <button type="button" className="ghostBtn" onClick={() => goToAppWithRole('franchiseManager')}>{t.franchiseManagerProfile}</button>
                  <button type="button" className="ghostBtn" onClick={() => goToAppWithRole('employee')}>{t.employeeProfile}</button>
                  <button type="button" className="ghostBtn" onClick={() => goToAppWithRole('guest')}>{t.guestProfile}</button>
                  <button type="button" className="primaryBtn" onClick={() => goPublic('/app/overview')}>{t.openAdmin}</button>
                </div>
              </details>
              <button type="button" className="ghostBtn" onClick={() => setLang((x) => (x === 'tr' ? 'en' : 'tr'))}>{lang.toUpperCase()}</button>
            </div>
          </div>
        </header>

        {location.pathname === '/' ? (
          <>
            <section className="publicHeroFullBleed" aria-label="hero">
              <div className="heroSlider heroSliderFull">
                {heroSlides.map((slide, idx) => (
                  <article
                    key={`${slide.image}-${idx}`}
                    className={`heroSlide heroSlideVisual ${idx === activeSlide ? 'active' : ''}`}
                    style={{ backgroundImage: `linear-gradient(105deg, rgba(15,23,42,0.72) 0%, rgba(15,23,42,0.35) 45%, rgba(248,250,252,0.2) 100%), url('${slide.image}')` }}
                  />
                ))}
                <div className="landingHeroOverlay">
                  <div className="landingHeroInner">
                    <p className="landingHeroBadge">
                      <Sparkles size={16} aria-hidden />
                      {t.landingHeroBadge}
                    </p>
                    <h2 className="landingHeroTitle">{activeHero.title}</h2>
                    <p className="landingHeroDesc">{activeHero.desc}</p>
                    <div className="landingHeroActions">
                      <button type="button" className="landingBtn landingBtnPrimary" onClick={() => goPublic('/#pricing')}>
                        {t.landingHeroCtaPrimary}
                        <ArrowRight size={18} aria-hidden />
                      </button>
                      <button type="button" className="landingBtn landingBtnGhost" onClick={() => goPublic('/apply')}>
                        {t.landingHeroCtaSecondary}
                      </button>
                    </div>
                    <p className="landingHeroTrust">{t.landingTrustLine}</p>
                  </div>
                </div>
                <div className="heroDots landingHeroDots">
                  {heroSlides.map((_, idx) => (
                    <button
                      key={`dot-${idx}`}
                      type="button"
                      className={idx === activeSlide ? 'active' : ''}
                      onClick={() => setActiveSlide(idx)}
                      aria-label={`slide-${idx + 1}`}
                    />
                  ))}
                </div>
              </div>
            </section>

            <div className="publicContent publicLanding">
              <section className="landingStats" aria-label={t.landingStatsHeadline}>
                <div className="landingSectionHead">
                  <h2 className="landingH2">{t.landingStatsHeadline}</h2>
                </div>
                <div className="landingStatsGrid">
                  {trustStats.map((row) => (
                    <div key={row.label} className="landingStatCard">
                      <span className="landingStatValue">{row.value}</span>
                      <span className="landingStatLabel">{row.label}</span>
                    </div>
                  ))}
                </div>
              </section>

              <section id="services" className="landingSection">
                <div className="landingSectionHead">
                  <h2 className="landingH2">{t.landingServicesTitle}</h2>
                  <p className="landingLead">{t.landingServicesLead}</p>
                </div>
                <div className="landingServiceGrid">
                  {serviceItems.map(({ Icon, title, desc }) => (
                    <article key={title} className="landingServiceCard">
                      <div className="landingServiceIcon" aria-hidden>
                        <Icon size={22} strokeWidth={1.75} />
                      </div>
                      <h3 className="landingH3">{title}</h3>
                      <p className="landingServiceDesc">{desc}</p>
                    </article>
                  ))}
                </div>
              </section>

              <section className="landingSection landingSectionAlt">
                <div className="landingSectionHead">
                  <h2 className="landingH2">{t.landingHowTitle}</h2>
                  <p className="landingLead">{t.landingHowLead}</p>
                </div>
                <div className="landingSteps">
                  {howSteps.map((step) => (
                    <div key={step.n} className="landingStep">
                      <span className="landingStepNum">{step.n}</span>
                      <h3 className="landingH3">{step.title}</h3>
                      <p className="landingStepDesc">{step.desc}</p>
                    </div>
                  ))}
                </div>
              </section>

              <section id="pricing" className="landingSection">
                <div className="landingSectionHead">
                  <h2 className="landingH2">{t.landingPricingTitle}</h2>
                  <p className="landingLead">{t.landingPricingLead}</p>
                </div>
                <div className="landingPricingGrid">
                  {plans.map((plan, idx) => {
                    const lines = planFeatureLines(plan, t);
                    const featured = plan.badgeLabel ? plan.badgeLabel.includes('En çok') || plan.badgeLabel.toLowerCase().includes('popular') : idx === featuredPlanIdx;
                    return (
                      <article
                        key={plan.code}
                        className={`landingPriceCard ${featured ? 'isFeatured' : ''} ${onboardForm.planCode === plan.code ? 'isSelected' : ''}`}
                      >
                        {plan.badgeLabel ? (
                          <span className="landingPriceBadge">{plan.badgeLabel}</span>
                        ) : featured ? (
                          <span className="landingPriceBadge">{t.landingPlanPopular}</span>
                        ) : null}
                        <h3 className="landingPriceName">{plan.name}</h3>
                        {plan.description ? <p className="landingPriceDesc">{plan.description}</p> : null}
                        <p className="landingPriceAmount">
                          <span className="landingPriceCurrency">₺</span>
                          {plan.priceAmount}
                          <span className="landingPricePeriod">/{plan.interval === 'MONTHLY' ? t.periodMonthly : t.periodYearly}</span>
                        </p>
                        <ul className="landingPriceList">
                          {lines.map((line) => (
                            <li key={line}>
                              <Check size={16} className="landingCheck" aria-hidden />
                              {line}
                            </li>
                          ))}
                          <li>
                            <Check size={16} className="landingCheck" aria-hidden />
                            {t.branches}: <strong>{plan.maxBranches}</strong>
                          </li>
                          <li>
                            <Check size={16} className="landingCheck" aria-hidden />
                            {t.staff}: <strong>{plan.maxStaff}</strong>
                          </li>
                          {plan.trialDays != null ? (
                            <li>
                              <Check size={16} className="landingCheck" aria-hidden />
                              {plan.trialDays} {t.applyTrialDays}
                            </li>
                          ) : null}
                        </ul>
                        <button
                          type="button"
                          className={featured ? 'landingBtn landingBtnPrimary landingBtnBlock' : 'landingBtn landingBtnOutline landingBtnBlock'}
                          onClick={() => {
                            setOnboardForm((s) => ({ ...s, planCode: plan.code }));
                            goPublic(`/apply?plan=${encodeURIComponent(plan.code)}`);
                          }}
                        >
                          {t.startWithPlan}
                        </button>
                      </article>
                    );
                  })}
                </div>
                <div className="landingPaymentPanel">
                  <h3 className="landingH3">{t.landingPaymentTitle}</h3>
                  <p className="landingLead landingPaymentLead">{t.landingPaymentLead}</p>
                  <div className="landingPaymentGrid">
                    <div className="landingPaymentCard">
                      <h4 className="landingPaymentCardTitle">{t.landingPaymentStripe}</h4>
                      <p className="landingPaymentCardDesc">{t.landingPaymentStripeDesc}</p>
                    </div>
                    <div className="landingPaymentCard">
                      <h4 className="landingPaymentCardTitle">{t.landingPaymentBank}</h4>
                      <p className="landingPaymentCardDesc">{t.landingBankHint}</p>
                      {platformBanks.length === 0 ? (
                        <p className="muted">{t.landingBankEmpty}</p>
                      ) : (
                        <ul className="landingBankList">
                          {platformBanks.map((b) => (
                            <li key={b.id} className="landingBankItem">
                              <strong>{b.label}</strong>
                              <span>{b.bankName}</span>
                              <code className="landingIban">{b.iban}</code>
                              <span className="muted">{b.accountHolder}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
                </div>
              </section>

              <section id="references" className="landingSection">
                <div className="landingSectionHead">
                  <h2 className="landingH2">{t.landingRefsTitle}</h2>
                  <p className="landingLead">{t.landingRefsLead}</p>
                </div>
                <div className="landingRefsGrid">
                  {tenants.length === 0 ? (
                    <p className="landingEmpty">{t.landingRefsEmpty}</p>
                  ) : (
                    tenants.slice(0, 8).map((tenant) => (
                      <article key={tenant.id} className="landingRefCard">
                        <div className="landingRefTop">
                          <span className="landingRefName">{tenant.name}</span>
                          <span className={`landingRefBadge landingRefBadge--${tenant.vertical.toLowerCase()}`}>{tenant.vertical}</span>
                        </div>
                        <div className="landingRefMeta">
                          <span><MapPin size={14} aria-hidden /> {tenant.branches} {t.branches}</span>
                          <span>{tenant.planName}</span>
                        </div>
                        <p className="landingRefSlug">{tenant.slug}</p>
                      </article>
                    ))
                  )}
                </div>
              </section>

              <section className="landingSection landingBranch">
                <div className="landingBranchInner">
                  <div className="landingBranchCopy">
                    <h2 className="landingH2">{t.landingBranchTitle}</h2>
                    <p className="landingLead">{t.landingBranchLead}</p>
                    <ul className="landingBranchList">
                      {branchPoints.map((line) => (
                        <li key={line}>
                          <Check size={18} className="landingCheck" aria-hidden />
                          {line}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className="landingBranchVisual" aria-hidden>
                    <Building2 size={56} strokeWidth={1.25} />
                    <span>{t.branches}</span>
                  </div>
                </div>
              </section>

              <section className="landingSection">
                <div className="landingSectionHead">
                  <h2 className="landingH2">{t.landingTestimonialTitle}</h2>
                </div>
                <div className="landingTestimonialGrid">
                  <article className="landingQuoteCard">
                    <Quote className="landingQuoteIcon" size={28} aria-hidden />
                    <p className="landingQuoteText">"{t.testimonial1}"</p>
                    <p className="landingQuoteAuthor">{t.testimonialAuthor1}</p>
                  </article>
                  <article className="landingQuoteCard">
                    <Quote className="landingQuoteIcon" size={28} aria-hidden />
                    <p className="landingQuoteText">"{t.testimonial2}"</p>
                    <p className="landingQuoteAuthor">{t.testimonialAuthor2}</p>
                  </article>
                </div>
              </section>

              <section id="faq" className="landingSection">
                <div className="landingSectionHead">
                  <h2 className="landingH2">{t.faqTitle}</h2>
                  <p className="landingLead">{t.faqMore}</p>
                </div>
                <div className="landingFaq">
                  <details className="landingFaqItem">
                    <summary>{t.faqQ1}</summary>
                    <p>{t.faqA1}</p>
                  </details>
                  <details className="landingFaqItem">
                    <summary>{t.faqQ2}</summary>
                    <p>{t.faqA2}</p>
                  </details>
                  <details className="landingFaqItem">
                    <summary>{t.faqQ3}</summary>
                    <p>{t.faqA3}</p>
                  </details>
                </div>
              </section>

              <section className="landingCta" aria-label={t.landingCtaTitle}>
                <div className="landingCtaInner">
                  <h2 className="landingCtaTitle">{t.landingCtaTitle}</h2>
                  <p className="landingCtaLead">{t.landingCtaLead}</p>
                  <div className="landingCtaActions">
                    <button type="button" className="landingBtn landingBtnOnDark" onClick={() => goPublic('/#pricing')}>
                      {t.landingCtaButton}
                    </button>
                    <button type="button" className="landingBtn landingBtnGhostOnDark" onClick={() => goPublic('/reserve')}>
                      {t.navReserve}
                    </button>
                  </div>
                </div>
              </section>

              <footer className="landingFooter">
                <div className="landingFooterGrid">
                  <div>
                    <p className="landingFooterBrand">{t.appTitle}</p>
                    <p className="landingFooterTag">{t.landingFooterTagline}</p>
                  </div>
                  <div>
                    <p className="landingFooterColTitle">{t.landingFooterProduct}</p>
                    <button type="button" className="landingFooterLink" onClick={() => goPublic('/#services')}>{t.navServices}</button>
                    <button type="button" className="landingFooterLink" onClick={() => goPublic('/#pricing')}>{t.navPricing}</button>
                    <button type="button" className="landingFooterLink" onClick={() => goPublic('/reserve')}>{t.navReserve}</button>
                  </div>
                  <div>
                    <p className="landingFooterColTitle">{t.landingFooterCompany}</p>
                    <button type="button" className="landingFooterLink" onClick={() => goPublic('/apply')}>{t.navApply}</button>
                    <button type="button" className="landingFooterLink" onClick={() => goPublic('/#faq')}>{t.navFaq}</button>
                    <p className="landingFooterNote">{t.landingFooterContact}</p>
                  </div>
                </div>
                <p className="landingFooterCopy">{t.landingFooterCopy.replace('{year}', String(footerYear))}</p>
              </footer>
            </div>
          </>
        ) : null}

        {location.pathname === '/reserve' ? (
          <div className="publicContent publicPagePad publicReserve">
            {isDemoTenantId(selectedTenantId) ? (
              <div className="reserveDemoBanner" role="status">
                <strong>Demo</strong>
                <span>{t.demoDataBanner}</span>
              </div>
            ) : null}
            <section className="card reserveCard reserveFlow">
              <nav className="reserveStepper" aria-label="booking steps">
                {[
                  { step: 1, label: t.reserveStep1, target: 'reserve-step-1' },
                  { step: 2, label: t.reserveStep2, target: 'reserve-step-2' },
                  { step: 3, label: t.reserveStep3, target: 'reserve-step-3' },
                  { step: 4, label: t.reserveStep4, target: 'booking-contact' },
                ].map(({ step, label, target }) => (
                  <button
                    key={target}
                    type="button"
                    className={`reserveStepPill ${bookingStep >= step ? 'isReached' : ''} ${bookingStep === step ? 'isActive' : ''}`}
                    onClick={() => document.getElementById(target)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                  >
                    <span className="reserveStepPillNum">{step}</span>
                    <span className="reserveStepPillLabel">{label}</span>
                  </button>
                ))}
              </nav>

              <h3 className="reserveFlowTitle">{t.reserveSectionTitle}</h3>
              <p className="muted reserveFlowLead">{t.reserveFlowHint}</p>
              <p className="muted reserveFlowLead">{t.selectStaffHint}</p>
              <p className="reserveSlotsAutoHint">{t.reserveSlotsAuto}</p>

              <div id="reserve-step-1" className="reserveBlock">
                <h4 className="reserveBlockTitle">
                  <span className="reserveBlockNum">1</span>
                  {t.reserveStep1}
                </h4>
                <label className="reserveLabel">
                  {t.selectTenant}
                  <select value={selectedTenantId} onChange={(e) => setSelectedTenantId(e.target.value)}>
                    {tenants.map((tenant) => (
                      <option key={tenant.id} value={tenant.id}>
                        {tenant.name}
                      </option>
                    ))}
                  </select>
                </label>
                <p className="reserveBlockSub">{t.selectBranch}</p>
                <div className="reserveBranchGrid">
                  {branches.map((b) => (
                    <button
                      key={b.id}
                      type="button"
                      className={`reserveBranchCard ${guestForm.branchId === b.id ? 'isSelected' : ''}`}
                      onClick={() => setGuestForm((s) => ({ ...s, branchId: b.id, staffUserId: '' }))}
                    >
                      <Building2 size={22} aria-hidden />
                      <span className="reserveBranchName">{b.name}</span>
                      <span className="reserveBranchCode">{b.code}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div id="reserve-step-2" className="reserveBlock">
                <h4 className="reserveBlockTitle">
                  <span className="reserveBlockNum">2</span>
                  {t.reserveStep2}
                </h4>
                <div className="reserveServiceGrid">
                  {branchServices.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      className={`reserveServiceCard ${guestForm.serviceId === s.id ? 'isSelected' : ''}`}
                      onClick={() => setGuestForm((prev) => ({ ...prev, serviceId: s.id }))}
                    >
                      <span className="reserveServiceName">{s.name}</span>
                      {s.category?.name ? <span className="reserveServiceCat">{s.category.name}</span> : null}
                      <span className="reserveServiceMeta">
                        {s.durationMin}′ · ₺{s.priceAmount} {s.currency}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              <div id="reserve-step-3" className="reserveBlock">
                <h4 className="reserveBlockTitle">
                  <span className="reserveBlockNum">3</span>
                  {t.reserveStep3}
                </h4>
                <p className="reserveShiftHint">{t.shiftBreak}</p>
                <div className="reserveWeekNav">
                  <button
                    type="button"
                    className="reserveWeekNavBtn"
                    onClick={() => setGuestForm((s) => ({ ...s, date: shiftDateByDays(s.date || todayISODate(), -7) }))}
                  >
                    <ChevronLeft size={18} aria-hidden />
                    <span>{t.reserveWeekPrev}</span>
                  </button>
                  <button
                    type="button"
                    className="reserveWeekNavBtn"
                    onClick={() => setGuestForm((s) => ({ ...s, date: shiftDateByDays(s.date || todayISODate(), 7) }))}
                  >
                    <span>{t.reserveWeekNext}</span>
                    <ChevronRight size={18} aria-hidden />
                  </button>
                </div>
                <div className="reserveWeekStrip" aria-label={t.reserveCalendarWeek}>
                  {reserveWeekDays.map((day) => (
                    <button
                      key={day.iso}
                      type="button"
                      className={`reserveWeekDay ${guestForm.date === day.iso ? 'isActive' : ''}`}
                      onClick={() => setGuestForm((s) => ({ ...s, date: day.iso }))}
                    >
                      <span className="reserveWeekDayShort">{day.dayShort}</span>
                      <span className="reserveWeekDayNum">{day.dayNum}</span>
                    </button>
                  ))}
                </div>
                <label className="reserveLabel reserveDateInput">
                  {t.selectDate}
                  <input type="date" value={guestForm.date} onChange={(e) => setGuestForm((s) => ({ ...s, date: e.target.value }))} />
                </label>

                <p className="reserveStaffPickTitle">{t.chooseStaff}</p>
                <div className="reserveStaffChips" role="group" aria-label={t.chooseStaff}>
                  <button
                    type="button"
                    className={`reserveStaffChip ${guestForm.staffUserId === '' ? 'isSelected' : ''}`}
                    onClick={() => setGuestForm((s) => ({ ...s, staffUserId: '' }))}
                  >
                    {t.anyStaff}
                  </button>
                  {staffCalendar.map((row) => (
                    <button
                      key={row.staffUserId}
                      type="button"
                      disabled={row.offDay}
                      className={`reserveStaffChip ${guestForm.staffUserId === row.staffUserId ? 'isSelected' : ''}`}
                      onClick={() => setGuestForm((s) => ({ ...s, staffUserId: row.staffUserId }))}
                    >
                      {row.staffName}
                      {row.offDay ? <span className="reserveStaffOff"> ({t.offDay})</span> : null}
                    </button>
                  ))}
                </div>

                <h5 className="reserveSubheading">{t.staffCalendar}</h5>
                <div className="reserveStaffDetailGrid">
                  {staffCalendar.map((row) => (
                    <div key={row.staffUserId} className={`reserveStaffDetailCard ${row.offDay ? 'isOff' : ''}`}>
                      <UserCircle2 className="reserveStaffAvatar" size={36} aria-hidden />
                      <div className="reserveStaffDetailBody">
                        <div className="reserveStaffDetailName">{row.staffName}</div>
                        <div className="reserveShiftTimes">
                          {row.shifts.length > 0
                            ? row.shifts
                                .map((sh) => `${new Date(sh.startsAt).toLocaleTimeString(lang === 'tr' ? 'tr-TR' : 'en-US', { hour: '2-digit', minute: '2-digit' })}–${new Date(sh.endsAt).toLocaleTimeString(lang === 'tr' ? 'tr-TR' : 'en-US', { hour: '2-digit', minute: '2-digit' })}`)
                                .join(' · ')
                            : '—'}
                        </div>
                        <div className="reserveStaffStats">
                          <span>
                            {t.booked}: <strong>{row.bookedCount}</strong>
                          </span>
                          <span>
                            {t.free}: <strong>{row.freeCount}</strong>
                          </span>
                        </div>
                      </div>
                      <span className={`reserveOffBadge ${row.offDay ? 'isOff' : ''}`}>{row.offDay ? t.offDay : t.active}</span>
                    </div>
                  ))}
                  {staffCalendar.length === 0 ? <p className="muted">{t.noRecords}</p> : null}
                </div>

                <div className="reserveSlotPanel">
                  <div className="reserveSlotPanelHead">
                    <div className="reserveSlotPanelTitle">
                      <Clock size={20} aria-hidden />
                      {t.reservePickSlot}
                    </div>
                    <button type="button" className="ghostBtn reserveRefreshBtn" onClick={() => void refreshSlots()} disabled={slotsLoading}>
                      <RefreshCw size={16} className={slotsLoading ? 'reserveSpin' : ''} aria-hidden />
                      {t.reserveRefreshSlots}
                    </button>
                  </div>
                  {slotsLoading ? <p className="reserveSlotsLoading">{t.reserveSlotsLoading}</p> : null}
                  {!slotsLoading && availability.length === 0 && guestForm.branchId && guestForm.serviceId && guestForm.date ? (
                    <p className="muted">{t.noRecords}</p>
                  ) : null}

                  {slotGroups.morning.length > 0 ? (
                    <div className="reserveSlotPeriod">
                      <h6 className="reserveSlotPeriodTitle">{t.reserveSlotsMorning}</h6>
                      <div className="reserveSlotGrid">
                        {slotGroups.morning.map((slot) => (
                          <button
                            type="button"
                            key={`m-${slot.staffUserId}-${slot.startsAt}`}
                            className="reserveSlotChip"
                            onClick={() => void handleBookSlotPublic(slot)}
                          >
                            <span className="reserveSlotTime">
                              {new Date(slot.startsAt).toLocaleTimeString(lang === 'tr' ? 'tr-TR' : 'en-US', { hour: '2-digit', minute: '2-digit' })}
                            </span>
                            <span className="reserveSlotStaff">{slot.staffName}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  {slotGroups.afternoon.length > 0 ? (
                    <div className="reserveSlotPeriod">
                      <h6 className="reserveSlotPeriodTitle">{t.reserveSlotsAfternoon}</h6>
                      <div className="reserveSlotGrid">
                        {slotGroups.afternoon.map((slot) => (
                          <button
                            type="button"
                            key={`a-${slot.staffUserId}-${slot.startsAt}`}
                            className="reserveSlotChip"
                            onClick={() => void handleBookSlotPublic(slot)}
                          >
                            <span className="reserveSlotTime">
                              {new Date(slot.startsAt).toLocaleTimeString(lang === 'tr' ? 'tr-TR' : 'en-US', { hour: '2-digit', minute: '2-digit' })}
                            </span>
                            <span className="reserveSlotStaff">{slot.staffName}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  {slotGroups.evening.length > 0 ? (
                    <div className="reserveSlotPeriod">
                      <h6 className="reserveSlotPeriodTitle">{t.reserveSlotsEvening}</h6>
                      <div className="reserveSlotGrid">
                        {slotGroups.evening.map((slot) => (
                          <button
                            type="button"
                            key={`e-${slot.staffUserId}-${slot.startsAt}`}
                            className="reserveSlotChip"
                            onClick={() => void handleBookSlotPublic(slot)}
                          >
                            <span className="reserveSlotTime">
                              {new Date(slot.startsAt).toLocaleTimeString(lang === 'tr' ? 'tr-TR' : 'en-US', { hour: '2-digit', minute: '2-digit' })}
                            </span>
                            <span className="reserveSlotStaff">{slot.staffName}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>

              <div id="booking-contact" className="reserveBlock">
                <h4 className="reserveBlockTitle">
                  <span className="reserveBlockNum">4</span>
                  {t.reserveContactTitle}
                </h4>
                <div className="formGrid reserveContactGrid">
                  <label className="reserveLabel">
                    {t.name}
                    <input value={guestForm.customerName} onChange={(e) => setGuestForm((s) => ({ ...s, customerName: e.target.value }))} autoComplete="name" />
                  </label>
                  <label className="reserveLabel">
                    {t.phone}
                    <input type="tel" value={guestForm.customerPhone} onChange={(e) => setGuestForm((s) => ({ ...s, customerPhone: e.target.value }))} autoComplete="tel" />
                  </label>
                  <label className="reserveLabel reserveSpan2">
                    {t.email}
                    <input type="email" value={guestForm.customerEmail} onChange={(e) => setGuestForm((s) => ({ ...s, customerEmail: e.target.value }))} autoComplete="email" />
                  </label>
                </div>
                <div className="reserveNotifRow">
                  <button
                    type="button"
                    className="ghostBtn"
                    onClick={async () => {
                      if (!selectedTenantId || (!guestForm.customerPhone && !guestForm.customerEmail)) return;
                      const qs = new URLSearchParams();
                      if (guestForm.customerPhone) qs.set('phone', guestForm.customerPhone);
                      if (guestForm.customerEmail) qs.set('email', guestForm.customerEmail.trim().toLowerCase());
                      try {
                        const rows = await apiGetWithHeaders<NotificationRow[]>(
                          `/guest/customer-notifications?${qs.toString()}`,
                          { 'x-tenant-id': selectedTenantId },
                        );
                        setCustomerNotifs(rows);
                      } catch {
                        setCustomerNotifs([]);
                      }
                    }}
                  >
                    {t.loadMyNotifications}
                  </button>
                </div>
              </div>

              <h4 className="reserveSubheading">{t.customerNotifications}</h4>
              <div className="reserveNotifList">
                {customerNotifs.map((n) => (
                  <div key={n.id} className="reserveNotifCard">
                    <span className="reserveNotifDate">{new Date(n.createdAt).toLocaleString(lang === 'tr' ? 'tr-TR' : 'en-US')}</span>
                    <span className="reserveNotifAction">{n.action}</span>
                    <span className="reserveNotifMeta">
                      {typeof n.metadata === 'object' && n.metadata && 'toStatus' in n.metadata
                        ? String((n.metadata as { toStatus?: string }).toStatus ?? '')
                        : '—'}
                    </span>
                  </div>
                ))}
                {customerNotifs.length === 0 ? <p className="muted">{t.noRecords}</p> : null}
              </div>
            </section>
          </div>
        ) : null}

        {location.pathname === '/apply' ? (
          <div className="publicContent publicPagePad publicApply">
            <section className="card applyFlow">
              <div className="applyHero">
                <h2 className="applyTitle">{t.applyWizardTitle}</h2>
                <p className="muted applyLead">{t.applyWizardLead}</p>
              </div>
              <div className="applyStepper" aria-label="Application steps">
                {[
                  { n: 1, label: t.applyStep1Title },
                  { n: 2, label: t.applyStep2Title },
                  { n: 3, label: t.applyStep3Title },
                  { n: 4, label: t.applyStep4Title },
                ].map(({ n, label }) => (
                  <button
                    key={n}
                    type="button"
                    className={`applyStepPill ${applyStep > n ? 'isDone' : ''} ${applyStep === n ? 'isActive' : ''}`}
                    onClick={() => {
                      if (n < applyStep) setApplyStep(n);
                    }}
                    disabled={n > applyStep}
                  >
                    <span className="applyStepPillNum">{n}</span>
                    <span className="applyStepPillLabel">{label}</span>
                  </button>
                ))}
              </div>

              {applyStep === 1 ? (
                <div className="applyStepBlock">
                  <h3 className="applyStepHeading">{t.applyStep1Title}</h3>
                  <p className="muted applyStepDesc">{t.landingCtaLead}</p>
                  <div className="applyTypeGrid">
                    <button
                      type="button"
                      className={`applyTypeCard ${applicationType === 'company' ? 'isSelected' : ''}`}
                      onClick={() => setApplicationType('company')}
                    >
                      <Building2 size={28} aria-hidden />
                      <span className="applyTypeTitle">{t.applyCompany}</span>
                      <span className="applyTypeDesc">{t.landingSvc2d}</span>
                    </button>
                    <button
                      type="button"
                      className={`applyTypeCard ${applicationType === 'franchise' ? 'isSelected' : ''}`}
                      onClick={() => setApplicationType('franchise')}
                    >
                      <MapPin size={28} aria-hidden />
                      <span className="applyTypeTitle">{t.applyFranchise}</span>
                      <span className="applyTypeDesc">{t.landingBranchLead}</span>
                    </button>
                  </div>
                  <p className="applyFieldLabel">{t.verticalType}</p>
                  <div className="applyVerticalGrid">
                    <button
                      type="button"
                      className={`applyVerticalCard ${onboardForm.vertical === 'BEAUTY' ? 'isSelected' : ''}`}
                      onClick={() => setOnboardForm((s) => ({ ...s, vertical: 'BEAUTY' }))}
                    >
                      <Sparkles size={22} aria-hidden />
                      {t.applyVerticalBeauty}
                    </button>
                    <button
                      type="button"
                      className={`applyVerticalCard ${onboardForm.vertical === 'HEALTH' ? 'isSelected' : ''}`}
                      onClick={() => setOnboardForm((s) => ({ ...s, vertical: 'HEALTH' }))}
                    >
                      <Shield size={22} aria-hidden />
                      {t.applyVerticalHealth}
                    </button>
                  </div>
                </div>
              ) : null}

              {applyStep === 2 ? (
                <div className="applyStepBlock">
                  <h3 className="applyStepHeading">{t.applyStep2Title}</h3>
                  <p className="applyFieldLabel">{t.applyStep2BranchScale}</p>
                  <div className="applyChipRow">
                    {(
                      [
                        ['1', t.applyBranch1],
                        ['2-5', t.applyBranch2_5],
                        ['5+', t.applyBranch5p],
                      ] as const
                    ).map(([key, label]) => (
                      <button
                        key={key}
                        type="button"
                        className={`applyChip ${applyNeeds.branchScale === key ? 'isSelected' : ''}`}
                        onClick={() => setApplyNeeds((s) => ({ ...s, branchScale: key }))}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <p className="applyFieldLabel">{t.applyTeamScale}</p>
                  <div className="applyChipRow">
                    {(
                      [
                        ['small', t.applyTeamSmall],
                        ['medium', t.applyTeamMedium],
                        ['large', t.applyTeamLarge],
                      ] as const
                    ).map(([key, label]) => (
                      <button
                        key={key}
                        type="button"
                        className={`applyChip ${applyNeeds.teamScale === key ? 'isSelected' : ''}`}
                        onClick={() => setApplyNeeds((s) => ({ ...s, teamScale: key }))}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <p className="applyFieldLabel">{t.applyModules}</p>
                  <div className="applyModuleGrid">
                    {(
                      [
                        ['reservations', t.applyModReservations],
                        ['multiBranch', t.applyModMultiBranch],
                        ['franchise', t.applyModFranchise],
                        ['accounting', t.applyModAccounting],
                      ] as const
                    ).map(([key, label]) => (
                      <label key={key} className="applyModuleCheck">
                        <input
                          type="checkbox"
                          checked={applyNeeds.modules[key]}
                          onChange={(e) =>
                            setApplyNeeds((s) => ({
                              ...s,
                              modules: { ...s.modules, [key]: e.target.checked },
                            }))
                          }
                        />
                        <span>{label}</span>
                      </label>
                    ))}
                  </div>
                  <div className="applyRecommendBanner">
                    <strong>{t.applyRecommended}:</strong>{' '}
                    {plans.find((p) => p.code === recommendedPlanCode)?.name ?? recommendedPlanCode}
                    <span className="applyRecommendHint">{t.applyRecommendedHint}</span>
                  </div>
                </div>
              ) : null}

              {applyStep === 3 ? (
                <div className="applyStepBlock">
                  <h3 className="applyStepHeading">{t.applyStep3Title}</h3>
                  <p className="muted">{t.comparePlans}</p>
                  <div className="applyPlanGrid">
                    {plans.map((plan, idx) => {
                      const featured = idx === applyFeaturedPlanIdx;
                      const selected = onboardForm.planCode === plan.code;
                      const recommended = plan.code === recommendedPlanCode;
                      return (
                        <article
                          key={plan.id}
                          className={`applyPlanCard ${featured ? 'isFeatured' : ''} ${selected ? 'isSelected' : ''}`}
                        >
                          {recommended ? <span className="applyPlanBadge">{t.applyRecommended}</span> : null}
                          {featured ? <span className="applyPlanBadge applyPlanBadgeAlt">{t.landingPlanPopular}</span> : null}
                          <h4 className="applyPlanName">{plan.name}</h4>
                          {plan.description ? <p className="applyPlanDesc">{plan.description}</p> : null}
                          <p className="applyPlanPrice">
                            <span className="applyPlanCurrency">₺</span>
                            {plan.priceAmount}
                            <span className="applyPlanPeriod">
                              /{plan.interval === 'MONTHLY' ? t.periodMonthly : t.periodYearly}
                            </span>
                          </p>
                          <ul className="applyPlanList">
                            {planFeatureLines(plan, t).map((line) => (
                              <li key={line}>
                                <Check size={14} className="applyPlanCheck" aria-hidden />
                                {line}
                              </li>
                            ))}
                            <li>
                              <Check size={14} className="applyPlanCheck" aria-hidden />
                              {t.branches}: <strong>{plan.maxBranches}</strong>
                            </li>
                            <li>
                              <Check size={14} className="applyPlanCheck" aria-hidden />
                              {t.staff}: <strong>{plan.maxStaff}</strong>
                            </li>
                            {plan.trialDays != null ? (
                              <li>
                                <Check size={14} className="applyPlanCheck" aria-hidden />
                                {plan.trialDays} {t.applyTrialDays}
                              </li>
                            ) : null}
                            {plan.maxAppointmentsMo != null ? (
                              <li>
                                <Check size={14} className="applyPlanCheck" aria-hidden />
                                {plan.maxAppointmentsMo.toLocaleString()} {t.applyMaxAppt}
                              </li>
                            ) : null}
                          </ul>
                          <button
                            type="button"
                            className={selected ? 'landingBtn landingBtnPrimary landingBtnBlock' : 'landingBtn landingBtnOutline landingBtnBlock'}
                            onClick={() => setOnboardForm((s) => ({ ...s, planCode: plan.code }))}
                          >
                            {selected ? t.selectedPlan : t.choosePlan}
                          </button>
                        </article>
                      );
                    })}
                  </div>
                </div>
              ) : null}

              {applyStep === 4 ? (
                <div className="applyStepBlock">
                  <h3 className="applyStepHeading">{t.applyStep4Title}</h3>
                  <div className="formGrid applyFormGrid">
                    <label className="applyLabel">
                      {t.companyName}
                      <input value={onboardForm.companyName} onChange={(e) => setOnboardForm((s) => ({ ...s, companyName: e.target.value }))} autoComplete="organization" />
                    </label>
                    <label className="applyLabel">
                      {t.slug}
                      <input
                        value={onboardForm.slug}
                        onChange={(e) => setOnboardForm((s) => ({ ...s, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-') }))}
                        placeholder="ornek-isletme"
                      />
                    </label>
                    <label className="applyLabel">
                      {t.adminName}
                      <input value={onboardForm.adminFullName} onChange={(e) => setOnboardForm((s) => ({ ...s, adminFullName: e.target.value }))} autoComplete="name" />
                    </label>
                    <label className="applyLabel">
                      {t.adminEmail}
                      <input type="email" value={onboardForm.adminEmail} onChange={(e) => setOnboardForm((s) => ({ ...s, adminEmail: e.target.value }))} autoComplete="email" />
                    </label>
                    <label className="applyLabel">
                      {t.applyDefaultCurrency}
                      <select value={onboardForm.defaultCurrency} onChange={(e) => setOnboardForm((s) => ({ ...s, defaultCurrency: e.target.value }))}>
                        <option value="TRY">TRY</option>
                        <option value="EUR">EUR</option>
                        <option value="USD">USD</option>
                      </select>
                    </label>
                  </div>
                  <label className="applyLabel applyLabelBlock">
                    {t.applyNotesPlaceholder}
                    <textarea
                      className="applyTextarea"
                      rows={3}
                      value={applyNotes}
                      onChange={(e) => setApplyNotes(e.target.value)}
                      placeholder={t.applyNotesPlaceholder}
                    />
                  </label>
                  <label className="applyTermsRow">
                    <input type="checkbox" checked={termsAccepted} onChange={(e) => setTermsAccepted(e.target.checked)} />
                    <span>{t.applyTerms}</span>
                  </label>
                  <p className="muted applySummary">
                    {t.selectedPlan}: <strong>{selectedPlan?.name ?? '—'}</strong> ({selectedPlan?.code ?? '—'})
                  </p>
                </div>
              ) : null}

              <div className="applyNav">
                <button type="button" className="ghostBtn" onClick={() => goPublic('/')}>
                  {t.backToSite}
                </button>
                <div className="applyNavEnd">
                  {applyStep > 1 ? (
                    <button type="button" className="ghostBtn" onClick={() => setApplyStep((s) => Math.max(1, s - 1))}>
                      {t.applyPrev}
                    </button>
                  ) : null}
                  {applyStep < 4 ? (
                    <button
                      type="button"
                      className="primaryBtn"
                      onClick={() => {
                        if (applyStep === 2) {
                          setOnboardForm((s) => ({ ...s, planCode: s.planCode || recommendedPlanCode }));
                        }
                        if (applyStep === 3) {
                          const nextCode = onboardForm.planCode || recommendedPlanCode;
                          if (!nextCode) {
                            setActionMessage(t.applySelectPlan);
                            return;
                          }
                          setOnboardForm((s) => ({ ...s, planCode: nextCode }));
                        }
                        setApplyStep((s) => Math.min(4, s + 1));
                      }}
                    >
                      {t.applyNext}
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="primaryBtn"
                      disabled={applySubmitting}
                      onClick={async () => {
                        if (!onboardForm.companyName || !onboardForm.slug || !onboardForm.adminEmail || !onboardForm.adminFullName || !onboardForm.planCode) {
                          setActionMessage(t.invalidForm);
                          return;
                        }
                        if (!termsAccepted) {
                          setActionMessage(t.applyTermsRequired);
                          return;
                        }
                        setApplySubmitting(true);
                        try {
                          await apiPost('/saas/onboard', {
                            ...onboardForm,
                            companyName: applicationType === 'franchise' ? `${onboardForm.companyName} Franchise` : onboardForm.companyName,
                            notes: applyNotes.trim() || undefined,
                            applicationKind: applicationType,
                          });
                          setActionMessage(t.onboardSuccess);
                          setApplyStep(1);
                          setApplyNotes('');
                          setTermsAccepted(false);
                        } catch {
                          setActionMessage(t.onboardFailed);
                        } finally {
                          setApplySubmitting(false);
                        }
                      }}
                    >
                      {applySubmitting ? t.loading : t.applySubmit}
                    </button>
                  )}
                </div>
              </div>
            </section>
          </div>
        ) : null}
        {actionMessage ? <div className="publicContent publicToast"><p className="muted">{actionMessage}</p></div> : null}
      </main>
    );
  }

  return (
    <main className="layout">
      <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="brand">AppointmentOS</div>
        <div className="langSwitch">
          <button className={lang === 'tr' ? 'active' : ''} onClick={() => setLang('tr')}>TR</button>
          <button className={lang === 'en' ? 'active' : ''} onClick={() => setLang('en')}>EN</button>
        </div>
        <nav className="menu">
          <p className="menuSection">{t.coreSection}</p>
          {visibleTabs.includes('showcase') ? <button className={tab === 'showcase' ? 'active' : ''} onClick={() => onTabChange('showcase')}><span className="menuIcon">{iconByTab.showcase}</span>{t.showcase}</button> : null}
          {visibleTabs.includes('overview') ? <button className={tab === 'overview' ? 'active' : ''} onClick={() => onTabChange('overview')}><span className="menuIcon">{iconByTab.overview}</span>{t.overview}</button> : null}
          {visibleTabs.includes('billing') ? <button className={tab === 'billing' ? 'active' : ''} onClick={() => onTabChange('billing')}><span className="menuIcon">{iconByTab.billing}</span>{t.billing}</button> : null}
          {visibleTabs.includes('operations') ? <button className={tab === 'operations' ? 'active' : ''} onClick={() => onTabChange('operations')}><span className="menuIcon">{iconByTab.operations}</span>{t.operations}</button> : null}

          <p className="menuSection">{t.peopleSection}</p>
          {visibleTabs.includes('guests') ? <button className={tab === 'guests' ? 'active' : ''} onClick={() => onTabChange('guests')}><span className="menuIcon">{iconByTab.guests}</span>{t.guests}</button> : null}
          {visibleTabs.includes('employees') ? <button className={tab === 'employees' ? 'active' : ''} onClick={() => onTabChange('employees')}><span className="menuIcon">{iconByTab.employees}</span>{t.employees}</button> : null}
          {visibleTabs.includes('managers') ? <button className={tab === 'managers' ? 'active' : ''} onClick={() => onTabChange('managers')}><span className="menuIcon">{iconByTab.managers}</span>{t.managers}</button> : null}

          <p className="menuSection">{t.authSection}</p>
          {visibleTabs.includes('companyRoles') ? <button className={tab === 'companyRoles' ? 'active' : ''} onClick={() => onTabChange('companyRoles')}><span className="menuIcon">{iconByTab.companyRoles}</span>{t.companyRoles}</button> : null}
          {visibleTabs.includes('franchiseRoles') ? <button className={tab === 'franchiseRoles' ? 'active' : ''} onClick={() => onTabChange('franchiseRoles')}><span className="menuIcon">{iconByTab.franchiseRoles}</span>{t.franchiseRoles}</button> : null}
          {visibleTabs.includes('subRoles') ? <button className={tab === 'subRoles' ? 'active' : ''} onClick={() => onTabChange('subRoles')}><span className="menuIcon">{iconByTab.subRoles}</span>{t.subRoles}</button> : null}

          <p className="menuSection">{t.opsSection}</p>
          {visibleTabs.includes('services') ? <button className={tab === 'services' ? 'active' : ''} onClick={() => onTabChange('services')}><span className="menuIcon">{iconByTab.services}</span>{t.services}</button> : null}
          {visibleTabs.includes('assignment') ? <button className={tab === 'assignment' ? 'active' : ''} onClick={() => onTabChange('assignment')}><span className="menuIcon">{iconByTab.assignment}</span>{t.assignment}</button> : null}
          {visibleTabs.includes('accounting') ? <button className={tab === 'accounting' ? 'active' : ''} onClick={() => onTabChange('accounting')}><span className="menuIcon">{iconByTab.accounting}</span>{t.accounting}</button> : null}
          {visibleTabs.includes('saasPlans') ? (
            <>
              <p className="menuSection">{t.platformSection}</p>
              <button className={tab === 'saasPlans' ? 'active' : ''} onClick={() => onTabChange('saasPlans')} type="button">
                <span className="menuIcon">{iconByTab.saasPlans}</span>
                {t.saasPlans}
              </button>
            </>
          ) : null}
        </nav>
      </aside>

      <section className="content">
        <header className="topbar">
          <button type="button" className="menuToggle" onClick={() => setSidebarOpen((v) => !v)} aria-label={t.menu}>
            {t.menu}
          </button>
          <div className="topbarTitle">
            <h1>{t.appTitle}</h1>
            <p>{t.appSubtitle}</p>
          </div>
          <div className="topbarActions">
            <select
              className="tenantSelect"
              value={selectedTenantId}
              onChange={(e) => setSelectedTenantId(e.target.value)}
              aria-label={t.tenant}
            >
              {tenants.map((tenant) => (
                <option key={tenant.id} value={tenant.id}>
                  {tenant.name}
                </option>
              ))}
            </select>
            <button type="button" className="ghostBtn topbarThemeBtn" onClick={() => setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'))} aria-label={theme === 'dark' ? 'Light theme' : 'Dark theme'}>
              {theme === 'dark' ? <SunMedium size={18} /> : <MoonStar size={18} />}
            </button>
          </div>
        </header>

        {!isLoggedIn ? (
          <section className="card loginCard">
            <h3>{t.loginQuick}</h3>
            <p className="muted">{t.loginQuickDesc}</p>
            <div className="profileSwitch">
              <button className={devProfile === 'superAdmin' ? 'active' : ''} onClick={() => setDevProfile('superAdmin')}>{t.superAdminProfile}</button>
              <button className={devProfile === 'companyManager' ? 'active' : ''} onClick={() => setDevProfile('companyManager')}>{t.companyManagerProfile}</button>
              <button className={devProfile === 'franchiseManager' ? 'active' : ''} onClick={() => setDevProfile('franchiseManager')}>{t.franchiseManagerProfile}</button>
              <button className={devProfile === 'employee' ? 'active' : ''} onClick={() => setDevProfile('employee')}>{t.employeeProfile}</button>
              <button className={devProfile === 'guest' ? 'active' : ''} onClick={() => setDevProfile('guest')}>{t.guestProfile}</button>
            </div>
            <div className="modalActions">
              <button className="primaryBtn" onClick={() => setIsLoggedIn(true)}>{t.loginAs} {profileLabel[devProfile]}</button>
            </div>
          </section>
        ) : (
          <section className="sessionBar">
            <div className="sessionBarText">
              <span className="muted">{t.loggedInAs}: <strong>{profileLabel[devProfile]}</strong></span>
              <p className="sessionRoleHint">{roleHint}</p>
            </div>
            <div className="modalActions">
              <button className="ghostBtn" onClick={() => setIsLoggedIn(false)}>{t.logout}</button>
              <button className="primaryBtn" onClick={() => onTabChange('overview')}>{t.goOverview}</button>
            </div>
          </section>
        )}

        {actionMessage ? <p className="muted">{actionMessage}</p> : null}

        {tab === 'showcase' ? (
          <section className="contentGrid single">
            <article className="card wide">
              <h3>{t.showcase}</h3>
              <p className="muted">AppointmentOS; çok şubeli işletmeler için rezervasyon, ekip takibi, ödeme ve muhasebe süreçlerini tek panelde birleştiren kurumsal SaaS platformudur.</p>
              <h4>{t.onboardTitle}</h4>
              <div className="formGrid">
                <label>{t.companyName}<input value={onboardForm.companyName} onChange={(e) => setOnboardForm((s) => ({ ...s, companyName: e.target.value }))} /></label>
                <label>{t.slug}<input value={onboardForm.slug} onChange={(e) => setOnboardForm((s) => ({ ...s, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-') }))} /></label>
                <label>{t.verticalType}<select value={onboardForm.vertical} onChange={(e) => setOnboardForm((s) => ({ ...s, vertical: e.target.value as Vertical }))}><option value="BEAUTY">BEAUTY</option><option value="HEALTH">HEALTH</option></select></label>
                <label>{t.adminName}<input value={onboardForm.adminFullName} onChange={(e) => setOnboardForm((s) => ({ ...s, adminFullName: e.target.value }))} /></label>
                <label>{t.adminEmail}<input value={onboardForm.adminEmail} onChange={(e) => setOnboardForm((s) => ({ ...s, adminEmail: e.target.value }))} /></label>
                <label>{t.plan}<select value={onboardForm.planCode} onChange={(e) => setOnboardForm((s) => ({ ...s, planCode: e.target.value }))}><option value="">{t.plan}</option>{plans.map((plan) => <option key={plan.id} value={plan.code}>{plan.name}</option>)}</select></label>
              </div>
              <div className="modalActions">
                <button className="primaryBtn" onClick={async () => {
                  if (!onboardForm.companyName || !onboardForm.slug || !onboardForm.adminEmail || !onboardForm.adminFullName || !onboardForm.planCode) {
                    setActionMessage(t.invalidForm);
                    return;
                  }
                  try {
                    await apiPost('/saas/onboard', onboardForm);
                    setActionMessage(t.onboardSuccess);
                    const tenantRows = await apiGet<TenantSummary[]>('/platform/tenants-summary');
                    setTenants(tenantRows);
                  } catch {
                    setActionMessage(t.onboardFailed);
                  }
                }}>{t.startTrial}</button>
              </div>
              <div className="plansGrid">
                {plans.map((plan) => (
                  <div key={plan.id} className="planCard">
                    <h4>{plan.name}</h4>
                    <p className="price">₺{plan.priceAmount}</p>
                    <p className="muted">{plan.interval}</p>
                  </div>
                ))}
              </div>
            </article>
          </section>
        ) : null}

        {tab === 'overview' ? (
          <>
            <section className="kpiGrid">
              {kpis.map((kpi) => (
                <article className="card" key={kpi.label}>
                  <p className="muted">{kpi.label}</p>
                  <h2>{kpi.value}</h2>
                  <span className="delta">{kpi.delta}</span>
                </article>
              ))}
            </section>
            <section className="contentGrid">
              <article className="card wide">
                <h3>{t.tenantPortfolio}</h3>
                <div className="tableWrap">
                  <table>
                    <thead>
                      <tr>
                        <th>{t.tenant}</th>
                        <th>{t.vertical}</th>
                        <th>{t.branches}</th>
                        <th>{t.plan}</th>
                        <th>{t.status}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tenants.map((tenant) => (
                        <tr key={tenant.id}>
                          <td>{tenant.name}</td>
                          <td>{tenant.vertical}</td>
                          <td>{tenant.branches}</td>
                          <td>{tenant.planName}</td>
                          <td><span className="badge">{tenant.subscriptionStatus}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </article>
              <article className="card">
                <h3>{t.fastChecks}</h3>
                <div className="staffRow"><span>{t.apiHealth}</span><strong>{t.healthy}</strong></div>
                <div className="staffRow"><span>{t.dbMigrations}</span><strong>{t.upToDate}</strong></div>
                <div className="staffRow"><span>{t.seedData}</span><strong>{t.loaded}</strong></div>
                <div className="staffRow"><span>{t.tenantIsolation}</span><strong>{t.active}</strong></div>
              </article>
            </section>
          </>
        ) : null}

        {tab === 'billing' ? (
          <section className="contentGrid single">
            <article className="card wide">
              <h3>{t.pricingPlans}</h3>
              <div className="plansGrid">
                {plans.map((plan) => (
                  <div key={plan.id} className="planCard">
                    <h4>{plan.name}</h4>
                    <p className="price">₺{plan.priceAmount} / {plan.interval === 'MONTHLY' ? (lang === 'tr' ? 'ay' : 'month') : (lang === 'tr' ? 'yil' : 'year')}</p>
                    <p className="muted">{plan.code}</p>
                    <p className="muted">{t.branches}: {plan.maxBranches}</p>
                    <p className="muted">{t.staff}: {plan.maxStaff}</p>
                  </div>
                ))}
              </div>
            </article>
            <article className="card">
              <h3>{t.recentPayments}</h3>
              <div className="modalActions">
                <select value={selectedSubscriptionId} onChange={(e) => setSelectedSubscriptionId(e.target.value)}>
                  <option value="">{t.subscription}</option>
                  {payments.map((p) => <option key={p.id} value={p.id}>{p.subscription.tenant.name}</option>)}
                </select>
                <button
                  className="primaryBtn"
                  onClick={async () => {
                    if (!selectedTenant || plans.length === 0) return;
                    try {
                      const context = await apiGet<{ plans: Plan[] }>(`/saas/checkout-context?tenantSlug=${selectedTenant.slug}`);
                      const firstPlan = context.plans[0] ?? plans[0];
                      const sub = await apiPost<{ id: string }>('/saas/subscribe', { tenantSlug: selectedTenant.slug, planCode: firstPlan.code });
                      await apiPost('/saas/payments/mock-pay', { subscriptionId: sub.id });
                      setActionMessage(t.purchaseSuccess);
                    } catch {
                      setActionMessage(t.purchaseFailed);
                    }
                  }}
                >
                  {t.checkout}
                </button>
              </div>
              <div className="tableWrap">
                <table>
                  <thead>
                    <tr>
                      <th>{t.tenant}</th>
                      <th>{t.plan}</th>
                      <th>{t.amount}</th>
                      <th>{t.status}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payments.slice(0, 8).map((payment) => (
                      <tr key={payment.id}>
                        <td>{payment.subscription.tenant.name}</td>
                        <td>{payment.subscription.plan.name}</td>
                        <td>₺{payment.amount}</td>
                        <td><span className="badge">{payment.status}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </article>
          </section>
        ) : null}

        {tab === 'guests' ? (
          <section className="contentGrid single">
            <article className="card wide reserveCard reserveFlow reserveFlowAdmin">
              <div className="reserveAdminHead">
                <h3>{t.guestScreen}</h3>
                {selectedTenant ? (
                  <p className="muted reserveAdminTenant">
                    <Building2 size={16} aria-hidden />
                    {selectedTenant.name}
                  </p>
                ) : null}
              </div>
              {isDemoTenantId(selectedTenantId) ? <p className="muted reserveAdminDemoHint">{t.demoDataBanner}</p> : null}

              <nav className="reserveStepper" aria-label="booking steps">
                {[
                  { step: 1, label: t.reserveStep1, target: 'guest-step-1' },
                  { step: 2, label: t.reserveStep2, target: 'guest-step-2' },
                  { step: 3, label: t.reserveStep3, target: 'guest-step-3' },
                  { step: 4, label: t.reserveStep4, target: 'booking-contact' },
                ].map(({ step, label, target }) => (
                  <button
                    key={target}
                    type="button"
                    className={`reserveStepPill ${bookingStep >= step ? 'isReached' : ''} ${bookingStep === step ? 'isActive' : ''}`}
                    onClick={() => document.getElementById(target)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                  >
                    <span className="reserveStepPillNum">{step}</span>
                    <span className="reserveStepPillLabel">{label}</span>
                  </button>
                ))}
              </nav>

              <p className="reserveSlotsAutoHint">{t.reserveSlotsAuto}</p>

              <div id="guest-step-1" className="reserveBlock">
                <h4 className="reserveBlockTitle">
                  <span className="reserveBlockNum">1</span>
                  {t.selectBranch}
                </h4>
                <div className="reserveBranchGrid">
                  {branches.map((b) => (
                    <button
                      key={b.id}
                      type="button"
                      className={`reserveBranchCard ${guestForm.branchId === b.id ? 'isSelected' : ''}`}
                      onClick={() => setGuestForm((s) => ({ ...s, branchId: b.id, staffUserId: '' }))}
                    >
                      <Building2 size={22} aria-hidden />
                      <span className="reserveBranchName">{b.name}</span>
                      <span className="reserveBranchCode">{b.code}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div id="guest-step-2" className="reserveBlock">
                <h4 className="reserveBlockTitle">
                  <span className="reserveBlockNum">2</span>
                  {t.reserveStep2}
                </h4>
                <div className="reserveServiceGrid">
                  {branchServices.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      className={`reserveServiceCard ${guestForm.serviceId === s.id ? 'isSelected' : ''}`}
                      onClick={() => setGuestForm((prev) => ({ ...prev, serviceId: s.id }))}
                    >
                      <span className="reserveServiceName">{s.name}</span>
                      {s.category?.name ? <span className="reserveServiceCat">{s.category.name}</span> : null}
                      <span className="reserveServiceMeta">
                        {s.durationMin}′ · ₺{s.priceAmount} {s.currency}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              <div id="guest-step-3" className="reserveBlock">
                <h4 className="reserveBlockTitle">
                  <span className="reserveBlockNum">3</span>
                  {t.reserveStep3}
                </h4>
                <p className="reserveShiftHint">{t.shiftBreak}</p>
                <div className="reserveWeekNav">
                  <button
                    type="button"
                    className="reserveWeekNavBtn"
                    onClick={() => setGuestForm((s) => ({ ...s, date: shiftDateByDays(s.date || todayISODate(), -7) }))}
                  >
                    <ChevronLeft size={18} aria-hidden />
                    <span>{t.reserveWeekPrev}</span>
                  </button>
                  <button
                    type="button"
                    className="reserveWeekNavBtn"
                    onClick={() => setGuestForm((s) => ({ ...s, date: shiftDateByDays(s.date || todayISODate(), 7) }))}
                  >
                    <span>{t.reserveWeekNext}</span>
                    <ChevronRight size={18} aria-hidden />
                  </button>
                </div>
                <div className="reserveWeekStrip" aria-label={t.reserveCalendarWeek}>
                  {reserveWeekDays.map((day) => (
                    <button
                      key={day.iso}
                      type="button"
                      className={`reserveWeekDay ${guestForm.date === day.iso ? 'isActive' : ''}`}
                      onClick={() => setGuestForm((s) => ({ ...s, date: day.iso }))}
                    >
                      <span className="reserveWeekDayShort">{day.dayShort}</span>
                      <span className="reserveWeekDayNum">{day.dayNum}</span>
                    </button>
                  ))}
                </div>
                <label className="reserveLabel reserveDateInput">
                  {t.selectDate}
                  <input type="date" value={guestForm.date} onChange={(e) => setGuestForm((s) => ({ ...s, date: e.target.value }))} />
                </label>

                <p className="reserveStaffPickTitle">{t.chooseStaff}</p>
                <div className="reserveStaffChips" role="group" aria-label={t.chooseStaff}>
                  <button
                    type="button"
                    className={`reserveStaffChip ${guestForm.staffUserId === '' ? 'isSelected' : ''}`}
                    onClick={() => setGuestForm((s) => ({ ...s, staffUserId: '' }))}
                  >
                    {t.anyStaff}
                  </button>
                  {staffCalendar.map((row) => (
                    <button
                      key={row.staffUserId}
                      type="button"
                      disabled={row.offDay}
                      className={`reserveStaffChip ${guestForm.staffUserId === row.staffUserId ? 'isSelected' : ''}`}
                      onClick={() => setGuestForm((s) => ({ ...s, staffUserId: row.staffUserId }))}
                    >
                      {row.staffName}
                      {row.offDay ? <span className="reserveStaffOff"> ({t.offDay})</span> : null}
                    </button>
                  ))}
                </div>

                <h5 className="reserveSubheading">{t.staffCalendar}</h5>
                <div className="reserveStaffDetailGrid">
                  {staffCalendar.map((row) => (
                    <div key={row.staffUserId} className={`reserveStaffDetailCard ${row.offDay ? 'isOff' : ''}`}>
                      <UserCircle2 className="reserveStaffAvatar" size={36} aria-hidden />
                      <div className="reserveStaffDetailBody">
                        <div className="reserveStaffDetailName">{row.staffName}</div>
                        <div className="reserveShiftTimes">
                          {row.shifts.length > 0
                            ? row.shifts
                                .map((sh) => `${new Date(sh.startsAt).toLocaleTimeString(lang === 'tr' ? 'tr-TR' : 'en-US', { hour: '2-digit', minute: '2-digit' })}–${new Date(sh.endsAt).toLocaleTimeString(lang === 'tr' ? 'tr-TR' : 'en-US', { hour: '2-digit', minute: '2-digit' })}`)
                                .join(' · ')
                            : '—'}
                        </div>
                        <div className="reserveStaffStats">
                          <span>
                            {t.booked}: <strong>{row.bookedCount}</strong>
                          </span>
                          <span>
                            {t.free}: <strong>{row.freeCount}</strong>
                          </span>
                        </div>
                      </div>
                      <span className={`reserveOffBadge ${row.offDay ? 'isOff' : ''}`}>{row.offDay ? t.offDay : t.active}</span>
                    </div>
                  ))}
                  {staffCalendar.length === 0 ? <p className="muted">{t.noRecords}</p> : null}
                </div>

                <div className="reserveSlotPanel">
                  <div className="reserveSlotPanelHead">
                    <div className="reserveSlotPanelTitle">
                      <Clock size={20} aria-hidden />
                      {t.reservePickSlot}
                    </div>
                    <button type="button" className="ghostBtn reserveRefreshBtn" onClick={() => void refreshSlots()} disabled={slotsLoading}>
                      <RefreshCw size={16} className={slotsLoading ? 'reserveSpin' : ''} aria-hidden />
                      {t.reserveRefreshSlots}
                    </button>
                  </div>
                  {slotsLoading ? <p className="reserveSlotsLoading">{t.reserveSlotsLoading}</p> : null}
                  {!slotsLoading && availability.length === 0 && guestForm.branchId && guestForm.serviceId && guestForm.date ? (
                    <p className="muted">{t.noRecords}</p>
                  ) : null}

                  {slotGroups.morning.length > 0 ? (
                    <div className="reserveSlotPeriod">
                      <h6 className="reserveSlotPeriodTitle">{t.reserveSlotsMorning}</h6>
                      <div className="reserveSlotGrid">
                        {slotGroups.morning.map((slot) => (
                          <button
                            type="button"
                            key={`adm-m-${slot.staffUserId}-${slot.startsAt}`}
                            className="reserveSlotChip"
                            onClick={() => void handleBookSlotPublic(slot)}
                          >
                            <span className="reserveSlotTime">
                              {new Date(slot.startsAt).toLocaleTimeString(lang === 'tr' ? 'tr-TR' : 'en-US', { hour: '2-digit', minute: '2-digit' })}
                            </span>
                            <span className="reserveSlotStaff">{slot.staffName}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  {slotGroups.afternoon.length > 0 ? (
                    <div className="reserveSlotPeriod">
                      <h6 className="reserveSlotPeriodTitle">{t.reserveSlotsAfternoon}</h6>
                      <div className="reserveSlotGrid">
                        {slotGroups.afternoon.map((slot) => (
                          <button
                            type="button"
                            key={`adm-a-${slot.staffUserId}-${slot.startsAt}`}
                            className="reserveSlotChip"
                            onClick={() => void handleBookSlotPublic(slot)}
                          >
                            <span className="reserveSlotTime">
                              {new Date(slot.startsAt).toLocaleTimeString(lang === 'tr' ? 'tr-TR' : 'en-US', { hour: '2-digit', minute: '2-digit' })}
                            </span>
                            <span className="reserveSlotStaff">{slot.staffName}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  {slotGroups.evening.length > 0 ? (
                    <div className="reserveSlotPeriod">
                      <h6 className="reserveSlotPeriodTitle">{t.reserveSlotsEvening}</h6>
                      <div className="reserveSlotGrid">
                        {slotGroups.evening.map((slot) => (
                          <button
                            type="button"
                            key={`adm-e-${slot.staffUserId}-${slot.startsAt}`}
                            className="reserveSlotChip"
                            onClick={() => void handleBookSlotPublic(slot)}
                          >
                            <span className="reserveSlotTime">
                              {new Date(slot.startsAt).toLocaleTimeString(lang === 'tr' ? 'tr-TR' : 'en-US', { hour: '2-digit', minute: '2-digit' })}
                            </span>
                            <span className="reserveSlotStaff">{slot.staffName}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>

              <div id="booking-contact" className="reserveBlock">
                <h4 className="reserveBlockTitle">
                  <span className="reserveBlockNum">4</span>
                  {t.reserveContactTitle}
                </h4>
                <div className="formGrid reserveContactGrid">
                  <label className="reserveLabel">
                    {t.name}
                    <input value={guestForm.customerName} onChange={(e) => setGuestForm((s) => ({ ...s, customerName: e.target.value }))} autoComplete="name" />
                  </label>
                  <label className="reserveLabel">
                    {t.phone}
                    <input type="tel" value={guestForm.customerPhone} onChange={(e) => setGuestForm((s) => ({ ...s, customerPhone: e.target.value }))} autoComplete="tel" />
                  </label>
                  <label className="reserveLabel reserveSpan2">
                    {t.email}
                    <input type="email" value={guestForm.customerEmail} onChange={(e) => setGuestForm((s) => ({ ...s, customerEmail: e.target.value }))} autoComplete="email" />
                  </label>
                </div>
                <div className="reserveNotifRow">
                  <button
                    type="button"
                    className="ghostBtn"
                    onClick={async () => {
                      if (!selectedTenantId || (!guestForm.customerPhone && !guestForm.customerEmail)) return;
                      const qs = new URLSearchParams();
                      if (guestForm.customerPhone) qs.set('phone', guestForm.customerPhone);
                      if (guestForm.customerEmail) qs.set('email', guestForm.customerEmail.trim().toLowerCase());
                      try {
                        const rows = await apiGetWithHeaders<NotificationRow[]>(
                          `/guest/customer-notifications?${qs.toString()}`,
                          { 'x-tenant-id': selectedTenantId },
                        );
                        setCustomerNotifs(rows);
                      } catch {
                        setCustomerNotifs([]);
                      }
                    }}
                  >
                    {t.loadMyNotifications}
                  </button>
                </div>
              </div>

              <h4 className="reserveSubheading">{t.customerNotifications}</h4>
              <div className="reserveNotifList">
                {customerNotifs.map((n) => (
                  <div key={n.id} className="reserveNotifCard">
                    <span className="reserveNotifDate">{new Date(n.createdAt).toLocaleString(lang === 'tr' ? 'tr-TR' : 'en-US')}</span>
                    <span className="reserveNotifAction">{n.action}</span>
                    <span className="reserveNotifMeta">
                      {typeof n.metadata === 'object' && n.metadata && 'toStatus' in n.metadata
                        ? String((n.metadata as { toStatus?: string }).toStatus ?? '')
                        : '—'}
                    </span>
                  </div>
                ))}
                {customerNotifs.length === 0 ? <p className="muted">{t.noRecords}</p> : null}
              </div>
            </article>
          </section>
        ) : null}

        {tab === 'employees' ? (
          <section className="contentGrid single">
            <article className="card wide">
              <div className="cardHead">
                <h3>{t.employeeScreen}</h3>
                <button className="primaryBtn" onClick={() => setEmployeeModalOpen(true)}>{t.addEmployee}</button>
              </div>
              <div className="tableWrap">
                <table>
                  <thead><tr><th>{t.name}</th><th>{t.role}</th><th>{t.branch}</th><th>{t.load}</th></tr></thead>
                  <tbody>{employeeRows.map((row) => <tr key={row.fullName}><td>{row.fullName}</td><td>{row.role}</td><td>{row.branch}</td><td>{row.load}</td></tr>)}</tbody>
                </table>
              </div>
            </article>
          </section>
        ) : null}

        {tab === 'managers' ? <section className="contentGrid single"><article className="card wide"><h3>{t.managerScreen}</h3><div className="tableWrap"><table><thead><tr><th>{t.name}</th><th>{t.role}</th><th>{t.branch}</th><th>{t.team}</th></tr></thead><tbody>{managerRows.map((row) => <tr key={row.fullName}><td>{row.fullName}</td><td>{row.role}</td><td>{row.branch}</td><td>{row.teamSize}</td></tr>)}</tbody></table></div></article></section> : null}

        {tab === 'companyRoles' ? <section className="contentGrid single"><article className="card wide"><h3>{t.companyRoles}</h3><div className="formGrid"><label>{t.roleCode}<input value={roleForm.code} onChange={(e) => setRoleForm((s) => ({ ...s, code: e.target.value }))} placeholder="CMP_MANAGER" /></label><label>{t.roleName}<input value={roleForm.name} onChange={(e) => setRoleForm((s) => ({ ...s, name: e.target.value }))} /></label><label>{t.roleDesc}<input value={roleForm.description} onChange={(e) => setRoleForm((s) => ({ ...s, description: e.target.value }))} /></label></div><div className="modalActions"><button className="primaryBtn" onClick={async () => { if (!selectedTenantId || !roleForm.code || !roleForm.name) return; try { await apiPost('/tenants/roles', roleForm, { 'x-tenant-id': selectedTenantId }); const roleRows = await apiGetWithHeaders<RoleRow[]>('/tenants/roles', { 'x-tenant-id': selectedTenantId }); setRoles(roleRows); setRoleForm({ code: '', name: '', description: '' }); } catch { setActionMessage(t.serviceCreateFailed); } }}>{t.addRole}</button></div><div className="tableWrap"><table><thead><tr><th>{t.roleCode}</th><th>{t.roleName}</th><th>{t.description}</th></tr></thead><tbody>{roles.filter((r) => r.code.startsWith('CMP_')).map((row) => <tr key={row.id}><td>{row.code}</td><td>{row.name}</td><td>{row.description}</td></tr>)}</tbody></table></div></article></section> : null}
        {tab === 'franchiseRoles' ? <section className="contentGrid single"><article className="card wide"><h3>{t.franchiseRoles}</h3><div className="tableWrap"><table><thead><tr><th>{t.roleCode}</th><th>{t.roleName}</th><th>{t.description}</th></tr></thead><tbody>{roles.filter((r) => r.code.startsWith('FRA_')).map((row) => <tr key={row.id}><td>{row.code}</td><td>{row.name}</td><td>{row.description}</td></tr>)}{roles.filter((r) => r.code.startsWith('FRA_')).length === 0 ? <tr><td colSpan={3} className="muted">{t.noRecords}</td></tr> : null}</tbody></table></div></article></section> : null}
        {tab === 'subRoles' ? <section className="contentGrid single"><article className="card wide"><h3>{t.subRoles}</h3><div className="tableWrap"><table><thead><tr><th>{t.roleCode}</th><th>{t.roleName}</th><th>{t.description}</th></tr></thead><tbody>{roles.filter((r) => r.code.startsWith('SUB_')).map((row) => <tr key={row.id}><td>{row.code}</td><td>{row.name}</td><td>{row.description}</td></tr>)}{roles.filter((r) => r.code.startsWith('SUB_')).length === 0 ? <tr><td colSpan={3} className="muted">{t.noRecords}</td></tr> : null}</tbody></table></div></article></section> : null}

        {tab === 'services' ? <section className="contentGrid single"><article className="card wide"><h3>{t.servicesCatalog}</h3><div className="formGrid"><label>{t.branch}<select value={serviceForm.branchId} onChange={(e) => setServiceForm((s) => ({ ...s, branchId: e.target.value }))}>{branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></label><label>{t.category}<input value={serviceForm.categoryName} onChange={(e) => setServiceForm((s) => ({ ...s, categoryName: e.target.value }))} /></label><label>{t.name}<input value={serviceForm.name} onChange={(e) => setServiceForm((s) => ({ ...s, name: e.target.value }))} /></label><label>{t.duration}<input type="number" value={serviceForm.durationMin} onChange={(e) => setServiceForm((s) => ({ ...s, durationMin: Number(e.target.value) }))} /></label><label>{t.amount}<input type="number" value={serviceForm.priceAmount} onChange={(e) => setServiceForm((s) => ({ ...s, priceAmount: Number(e.target.value) }))} /></label><label>{t.currency}<input value={serviceForm.currency} onChange={(e) => setServiceForm((s) => ({ ...s, currency: e.target.value }))} /></label></div><div className="modalActions"><button className="ghostBtn" onClick={async () => { try { await apiPost('/tenants/settings/currency', { currency: currencyForm }, { 'x-tenant-id': selectedTenantId }); setActionMessage(t.currencyUpdated); } catch { setActionMessage(t.currencyUpdateFailed); } }}>{t.save} {t.currency}</button><input value={currencyForm} onChange={(e) => setCurrencyForm(e.target.value)} /><button className="primaryBtn" onClick={async () => { try { await apiPost('/services', serviceForm, { 'x-tenant-id': selectedTenantId }); setActionMessage(t.serviceCreated); } catch { setActionMessage(t.serviceCreateFailed); } }}>{t.save}</button></div><div className="tableWrap"><table><thead><tr><th>{t.name}</th><th>{t.category}</th><th>{t.duration}</th><th>{t.amount}</th></tr></thead><tbody>{branchServices.map((row) => <tr key={row.id}><td>{row.name}</td><td>{row.category?.name ?? '-'}</td><td>{row.durationMin}</td><td>{row.priceAmount} {row.currency}</td></tr>)}</tbody></table></div></article></section> : null}

        {tab === 'assignment' ? <section className="contentGrid single"><article className="card wide"><h3>{t.reservationAssign}</h3><div className="modalActions"><label>{t.reservationStatus}<select value={reservationStatusFilter} onChange={(e) => setReservationStatusFilter(e.target.value as ReservationStatusFilter)}><option value="ALL">{t.all}</option><option value="PENDING">PENDING</option><option value="CONFIRMED">CONFIRMED</option><option value="IN_PROGRESS">IN_PROGRESS</option><option value="COMPLETED">COMPLETED</option></select></label></div><div className="tableWrap"><table><thead><tr><th>{t.name}</th><th>{t.reservation}</th><th>{t.employees}</th><th>{t.branch}</th><th>{t.status}</th><th>{t.action}</th></tr></thead><tbody>{reservations.map((row) => <tr key={row.id}><td>{row.customer.fullName}</td><td>{row.service.name} / {new Date(row.startsAt).toLocaleString()}</td><td>{row.staffUser.fullName}</td><td>{row.branch.name}</td><td><span className="badge">{row.status}</span></td><td><div className="actionBtns"><button className="ghostBtn" disabled={!canApprove(row.status)} onClick={async () => { try { await apiPost(`/employee/reservations/${row.id}/approve`, { changedByEmail: actorEmail }, { 'x-tenant-id': selectedTenantId }); const reservationQuery = reservationStatusFilter === 'ALL' ? '' : `?status=${reservationStatusFilter}`; const reservationRows = await apiGetWithHeaders<ReservationRow[]>(`/employee/reservations${reservationQuery}`, { 'x-tenant-id': selectedTenantId }); setReservations(reservationRows); setActionMessage(`${t.approved}: ${row.id}`); } catch { setActionMessage(t.approveFailed); } }}>{t.approve}</button><button className="ghostBtn" disabled={!canStart(row.status)} onClick={async () => { try { await apiPost(`/employee/reservations/${row.id}/start`, { changedByEmail: actorEmail }, { 'x-tenant-id': selectedTenantId }); const reservationQuery = reservationStatusFilter === 'ALL' ? '' : `?status=${reservationStatusFilter}`; const reservationRows = await apiGetWithHeaders<ReservationRow[]>(`/employee/reservations${reservationQuery}`, { 'x-tenant-id': selectedTenantId }); setReservations(reservationRows); setActionMessage(`${t.started}: ${row.id}`); } catch { setActionMessage(t.startFailed); } }}>{t.start}</button><button className="primaryBtn" disabled={!canComplete(row.status)} onClick={async () => { try { await apiPost(`/employee/reservations/${row.id}/complete`, { changedByEmail: actorEmail }, { 'x-tenant-id': selectedTenantId }); const reservationQuery = reservationStatusFilter === 'ALL' ? '' : `?status=${reservationStatusFilter}`; const ledgerQuery = ledgerTypeFilter === 'ALL' ? '' : `?type=${ledgerTypeFilter}`; const [reservationRows, ledgerRows] = await Promise.all([apiGetWithHeaders<ReservationRow[]>(`/employee/reservations${reservationQuery}`, { 'x-tenant-id': selectedTenantId }), apiGetWithHeaders<LedgerEntry[]>(`/accounting/ledger${ledgerQuery}`, { 'x-tenant-id': selectedTenantId })]); setReservations(reservationRows); setLedger(ledgerRows); setActionMessage(`${t.completedAndAccounted}: ${row.id}`); } catch { setActionMessage(t.completeFailed); } }}>{t.complete}</button></div></td></tr>)}{reservations.length === 0 ? <tr><td colSpan={6} className="muted">{t.noRecords}</td></tr> : null}</tbody></table></div></article></section> : null}

        {tab === 'operations' ? (
          <section className="contentGrid single">
            <article className="card wide">
              <h3>{t.staffNotifications}</h3>
              <div className="modalActions">
                <select value={selectedStaffId} onChange={(e) => setSelectedStaffId(e.target.value)}>
                  <option value="">{t.chooseStaff}</option>
                  {staffOptions.map((staff) => <option key={staff.id} value={staff.id}>{staff.name}</option>)}
                </select>
                <button
                  className="ghostBtn"
                  onClick={async () => {
                    if (!selectedTenantId || !selectedStaffId) return;
                    try {
                      const rows = await apiGetWithHeaders<NotificationRow[]>(`/employee/notifications?staffUserId=${selectedStaffId}`, { 'x-tenant-id': selectedTenantId });
                      setNotifications(rows);
                    } catch {
                      setNotifications([]);
                    }
                  }}
                  disabled={!selectedStaffId}
                >
                  {t.refresh}
                </button>
              </div>
              <div className="tableWrap">
                <table>
                  <thead><tr><th>{t.date}</th><th>{t.description}</th><th>{t.status}</th></tr></thead>
                  <tbody>{notifications.map((n) => <tr key={n.id}><td>{new Date(n.createdAt).toLocaleString()}</td><td>{n.action}</td><td><span className="badge">{n.metadata?.toStatus ?? 'NEW'}</span></td></tr>)}</tbody>
                </table>
              </div>
            </article>
          </section>
        ) : null}

        {tab === 'accounting' ? (
          <section className="contentGrid single">
            <article className="card wide accountingCard">
              <div className="accountingHead">
                <div>
                  <h3>{t.preAccounting}</h3>
                  <p className="muted accountingLead">{t.landingSvc6d}</p>
                </div>
                <button type="button" className="ghostBtn accountingExportBtn" onClick={exportLedgerCsv} disabled={ledger.length === 0}>
                  <Download size={16} aria-hidden />
                  {t.ledgerExportCsv}
                </button>
              </div>
              <div className="ledgerKpiGrid">
                <article className="ledgerKpi">
                  <Calculator size={22} className="ledgerKpiIcon" aria-hidden />
                  <p className="muted">{t.ledgerTotalIncome}</p>
                  <strong className="ledgerKpiValue">₺{ledgerSummary.income.toLocaleString(lang === 'tr' ? 'tr-TR' : 'en-US', { minimumFractionDigits: 2 })}</strong>
                </article>
                <article className="ledgerKpi">
                  <Banknote size={22} className="ledgerKpiIcon" aria-hidden />
                  <p className="muted">{t.ledgerTotalCashIn}</p>
                  <strong className="ledgerKpiValue">₺{ledgerSummary.cashIn.toLocaleString(lang === 'tr' ? 'tr-TR' : 'en-US', { minimumFractionDigits: 2 })}</strong>
                </article>
                <article className="ledgerKpi">
                  <BarChart3 size={22} className="ledgerKpiIcon" aria-hidden />
                  <p className="muted">{t.ledgerNetMovement}</p>
                  <strong className="ledgerKpiValue">₺{ledgerSummary.total.toLocaleString(lang === 'tr' ? 'tr-TR' : 'en-US', { minimumFractionDigits: 2 })}</strong>
                </article>
                <article className="ledgerKpi">
                  <ClipboardList size={22} className="ledgerKpiIcon" aria-hidden />
                  <p className="muted">{t.ledgerEntriesCount}</p>
                  <strong className="ledgerKpiValue">{ledgerSummary.count}</strong>
                </article>
              </div>
              <div className="modalActions accountingFilters">
                <label className="accountingFilterLabel">
                  {t.ledgerType}
                  <select value={ledgerTypeFilter} onChange={(e) => setLedgerTypeFilter(e.target.value as LedgerTypeFilter)}>
                    <option value="ALL">{t.all}</option>
                    <option value="INCOME">{t.ledgerTypeIncome}</option>
                    <option value="CASH_IN">{t.ledgerTypeCashIn}</option>
                  </select>
                </label>
              </div>
              <div className="accountingCashCard">
                <h4 className="accountingSubTitle">{t.manualCashIn}</h4>
                <div className="formGrid accountingCashGrid">
                  <label>{t.amount}<input type="number" value={cashInForm.amount} onChange={(e) => setCashInForm((s) => ({ ...s, amount: Number(e.target.value) }))} /></label>
                  <label>{t.currency}<input value={cashInForm.currency} onChange={(e) => setCashInForm((s) => ({ ...s, currency: e.target.value }))} /></label>
                  <label className="accountingDescSpan">{t.description}<input value={cashInForm.description} onChange={(e) => setCashInForm((s) => ({ ...s, description: e.target.value }))} /></label>
                </div>
                <div className="modalActions">
                  <button
                    className="primaryBtn"
                    onClick={async () => {
                      if (!selectedTenantId) return;
                      try {
                        await apiPost('/accounting/cash-in', cashInForm, { 'x-tenant-id': selectedTenantId });
                        const ledgerQuery = ledgerTypeFilter === 'ALL' ? '' : `?type=${ledgerTypeFilter}`;
                        const ledgerRows = await apiGetWithHeaders<LedgerEntry[]>(`/accounting/ledger${ledgerQuery}`, { 'x-tenant-id': selectedTenantId });
                        setLedger(ledgerRows);
                        setActionMessage(t.cashInSuccess);
                      } catch {
                        setActionMessage(t.cashInFailed);
                      }
                    }}
                  >
                    {t.manualCashIn}
                  </button>
                </div>
              </div>
              <div className="tableWrap accountingTableWrap">
                <table>
                  <thead>
                    <tr>
                      <th>{t.date}</th>
                      <th>{t.type}</th>
                      <th>{t.description}</th>
                      <th>{t.amount}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ledger.map((row) => (
                      <tr key={row.id}>
                        <td>{new Date(row.createdAt).toLocaleString(lang === 'tr' ? 'tr-TR' : 'en-US')}</td>
                        <td>
                          <span className={`ledgerTypePill ledgerTypePill--${row.type}`}>{ledgerRowLabel(row.type)}</span>
                        </td>
                        <td>{row.description ?? '—'}</td>
                        <td className="ledgerAmountCell">
                          {row.amount} {row.currency}
                        </td>
                      </tr>
                    ))}
                    {ledger.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="muted">
                          {t.noRecords}
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </article>
          </section>
        ) : null}

        {tab === 'saasPlans' && devProfile === 'superAdmin' ? (
          <section className="contentGrid single">
            <article className="card wide saasPlansCard">
              <h3>{t.saasPlans}</h3>
              <p className="muted">{t.saasPlansLead}</p>
              <h4 className="saasPlansSub">{t.saasPlansPackages}</h4>
              <div className="tableWrap">
                <table>
                  <thead>
                    <tr>
                      <th>{t.slug}</th>
                      <th>{t.name}</th>
                      <th>{t.amount}</th>
                      <th>{t.plan}</th>
                      <th>{t.sortOrderLabel}</th>
                      <th>Stripe</th>
                      <th>{t.status}</th>
                      <th>{t.action}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {localPlans.map((p) => (
                      <tr key={p.id}>
                        <td>
                          <code>{p.code}</code>
                        </td>
                        <td>
                          <input
                            className="saasInlineInput"
                            value={p.name}
                            onChange={(e) => setLocalPlans((prev) => prev.map((x) => (x.id === p.id ? { ...x, name: e.target.value } : x)))}
                          />
                        </td>
                        <td>
                          <input
                            type="number"
                            className="saasInlineInput saasInlineNum"
                            value={p.priceAmount}
                            onChange={(e) =>
                              setLocalPlans((prev) => prev.map((x) => (x.id === p.id ? { ...x, priceAmount: e.target.value } : x)))
                            }
                          />
                        </td>
                        <td>
                          <select
                            value={p.interval}
                            onChange={(e) =>
                              setLocalPlans((prev) =>
                                prev.map((x) => (x.id === p.id ? { ...x, interval: e.target.value as Plan['interval'] } : x)),
                              )
                            }
                          >
                            <option value="MONTHLY">MONTHLY</option>
                            <option value="YEARLY">YEARLY</option>
                          </select>
                        </td>
                        <td>
                          <input
                            type="number"
                            className="saasInlineInput saasInlineNum"
                            value={p.sortOrder ?? 0}
                            onChange={(e) =>
                              setLocalPlans((prev) =>
                                prev.map((x) => (x.id === p.id ? { ...x, sortOrder: Number(e.target.value) } : x)),
                              )
                            }
                          />
                        </td>
                        <td>
                          <input
                            className="saasInlineInput"
                            placeholder="price_..."
                            value={p.stripePriceId ?? ''}
                            onChange={(e) =>
                              setLocalPlans((prev) => prev.map((x) => (x.id === p.id ? { ...x, stripePriceId: e.target.value || null } : x)))
                            }
                          />
                        </td>
                        <td>
                          <label className="saasCheck">
                            <input
                              type="checkbox"
                              checked={p.isActive !== false}
                              onChange={(e) =>
                                setLocalPlans((prev) => prev.map((x) => (x.id === p.id ? { ...x, isActive: e.target.checked } : x)))
                              }
                            />
                            {t.active}
                          </label>
                        </td>
                        <td>
                          <button
                            type="button"
                            className="primaryBtn"
                            onClick={async () => {
                              try {
                                const fl = Array.isArray(p.featureLines) ? p.featureLines : [];
                                await apiPatch(`/platform/plans/${p.id}`, {
                                  name: p.name,
                                  description: p.description ?? undefined,
                                  sortOrder: p.sortOrder ?? 0,
                                  badgeLabel: p.badgeLabel,
                                  stripePriceId: p.stripePriceId,
                                  featureLines: fl,
                                  priceAmount: Number(p.priceAmount),
                                  currency: 'TRY',
                                  interval: p.interval,
                                  trialDays: p.trialDays ?? 14,
                                  maxBranches: p.maxBranches,
                                  maxStaff: p.maxStaff,
                                  maxAppointmentsMo: p.maxAppointmentsMo ?? 500,
                                  isActive: p.isActive !== false,
                                });
                                const refreshed = await apiGet<Plan[]>('/platform/plans');
                                setAdminPlans(refreshed);
                                try {
                                  const pub = await apiGet<Plan[]>('/saas/plans');
                                  if (pub.length) setPlans(pub);
                                } catch {
                                  /* keep FALLBACK */
                                }
                                setActionMessage(t.planSaved);
                              } catch {
                                setActionMessage(t.planSaveFailed);
                              }
                            }}
                          >
                            {t.save}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="muted">{t.stripeEnvHint}</p>

              <h4 className="saasPlansSub">{t.saasPlansBanks}</h4>
              <div className="tableWrap">
                <table>
                  <thead>
                    <tr>
                      <th>{t.name}</th>
                      <th>{t.bankName}</th>
                      <th>{t.accountHolder}</th>
                      <th>IBAN</th>
                      <th>{t.sortOrderLabel}</th>
                      <th>{t.status}</th>
                      <th>{t.action}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {localBanks.map((b) => (
                      <tr key={b.id}>
                        <td>
                          <input
                            className="saasInlineInput"
                            value={b.label}
                            onChange={(e) => setLocalBanks((prev) => prev.map((x) => (x.id === b.id ? { ...x, label: e.target.value } : x)))}
                          />
                        </td>
                        <td>
                          <input
                            className="saasInlineInput"
                            value={b.bankName}
                            onChange={(e) => setLocalBanks((prev) => prev.map((x) => (x.id === b.id ? { ...x, bankName: e.target.value } : x)))}
                          />
                        </td>
                        <td>
                          <input
                            className="saasInlineInput"
                            value={b.accountHolder}
                            onChange={(e) => setLocalBanks((prev) => prev.map((x) => (x.id === b.id ? { ...x, accountHolder: e.target.value } : x)))}
                          />
                        </td>
                        <td>
                          <input
                            className="saasInlineInput landingIban"
                            value={b.iban}
                            onChange={(e) => setLocalBanks((prev) => prev.map((x) => (x.id === b.id ? { ...x, iban: e.target.value } : x)))}
                          />
                        </td>
                        <td>
                          <input
                            type="number"
                            className="saasInlineInput saasInlineNum"
                            value={b.sortOrder}
                            onChange={(e) =>
                              setLocalBanks((prev) => prev.map((x) => (x.id === b.id ? { ...x, sortOrder: Number(e.target.value) } : x)))
                            }
                          />
                        </td>
                        <td>
                          <label className="saasCheck">
                            <input
                              type="checkbox"
                              checked={b.isActive}
                              onChange={(e) =>
                                setLocalBanks((prev) => prev.map((x) => (x.id === b.id ? { ...x, isActive: e.target.checked } : x)))
                              }
                            />
                            {t.active}
                          </label>
                        </td>
                        <td>
                          <button
                            type="button"
                            className="primaryBtn"
                            onClick={async () => {
                              try {
                                await apiPatch(`/platform/bank-accounts/${b.id}`, {
                                  label: b.label,
                                  bankName: b.bankName,
                                  accountHolder: b.accountHolder,
                                  iban: b.iban,
                                  swift: b.swift,
                                  currency: b.currency,
                                  sortOrder: b.sortOrder,
                                  isActive: b.isActive,
                                });
                                const refreshed = await apiGet<PlatformBankAccount[]>('/platform/bank-accounts');
                                setAdminBanks(refreshed);
                                const pub = await apiGet<PlatformBankAccount[]>('/saas/bank-accounts').catch(() => []);
                                setPlatformBanks(pub);
                                setActionMessage(t.bankSaved);
                              } catch {
                                setActionMessage(t.bankSaveFailed);
                              }
                            }}
                          >
                            {t.save}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </article>
          </section>
        ) : null}
      </section>

      {employeeModalOpen ? (
        <div className="modalBackdrop">
          <div className="modalCard">
            <h3>{t.addEmployee}</h3>
            <div className="formGrid">
              <label>{t.name}<input value={newEmployee.name} onChange={(e) => setNewEmployee((s) => ({ ...s, name: e.target.value }))} /></label>
              <label>{t.email}<input value={newEmployee.email} onChange={(e) => setNewEmployee((s) => ({ ...s, email: e.target.value }))} /></label>
              <label>{t.role}<input value={newEmployee.role} onChange={(e) => setNewEmployee((s) => ({ ...s, role: e.target.value }))} /></label>
              <label>{t.branch}<input value={newEmployee.branch} onChange={(e) => setNewEmployee((s) => ({ ...s, branch: e.target.value }))} /></label>
            </div>
            <div className="modalActions">
              <button className="ghostBtn" onClick={() => setEmployeeModalOpen(false)}>{t.cancel}</button>
              <button className="primaryBtn" onClick={() => setEmployeeModalOpen(false)}>{t.save}</button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
