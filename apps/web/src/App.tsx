import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  Calendar,
  CalendarClock,
  Check,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Clock,
  Loader2,
  Mail,
  Phone,
  Send,
  User,
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
  Utensils,
  UserRoundCheck,
  UserRoundPlus,
  Users,
  Wrench,
} from 'lucide-react';
import { apiDelete, apiGet, apiGetWithHeaders, apiPatch, apiPost, getApiErrorMessage } from './core/api/client';
import { translations, type Lang } from './i18n/translations';
import { employeeRows, managerRows } from './mock/dashboardData';
import {
  buildDemoAvailability,
  buildDemoStaffCalendar,
  demoReservationSuccessMessage,
  getDemoBranches,
  getDemoPricingHintForDate,
  getDemoSpecialPricingDateYmd,
  getDemoServicesForBranch,
  guestBranchesAreDemoPack,
  guestDemoBundleTenantId,
  isDemoTenantId,
  slugToDemoTenantId,
} from './mock/demoReservationData';

type TabKey =
  | 'overview'
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
type TenantSummary = {
  id: string;
  name: string;
  slug: string;
  vertical: 'BEAUTY' | 'HEALTH' | 'RESTAURANT';
  branches: number;
  subscriptionStatus: string;
  planName: string;
};
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
  stripeProductId?: string | null;
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
type RecentPayment = {
  id: string;
  amount: string;
  status: string;
  paidAt?: string | null;
  createdAt?: string;
  provider?: string;
  providerRef?: string | null;
  subscription: { id: string; tenant: { name: string }; plan: { name: string } };
};
type TenantBillingPayload = {
  tenant: { id: string; name: string; slug: string; vertical: string; defaultCurrency: string };
  subscription: {
    id: string;
    status: string;
    nextBillingAt: string | null;
    trialEndsAt: string | null;
    plan: {
      code: string;
      name: string;
      priceAmount: string;
      currency: string;
      interval: string;
      maxBranches: number;
      maxStaff: number;
      maxAppointmentsMo: number;
      stripePriceId?: string | null;
    };
    payments: Array<{
      id: string;
      amount: string;
      currency: string;
      status: string;
      provider: string;
      providerRef: string | null;
      paidAt: string | null;
      createdAt: string;
    }>;
  } | null;
  bankAccounts: PlatformBankAccount[];
};
type TenantOverviewPayload = {
  tenant: { name: string; slug: string; vertical: string; defaultCurrency: string };
  metrics: {
    branches: number;
    staff: number;
    appointmentsLast7Days: number;
    appointmentsTotal: number;
    serviceIncomeTotal: string | number;
  };
  subscription: {
    id: string;
    status: string;
    planName: string;
    planCode: string;
    nextBillingAt: string | null;
    trialEndsAt: string | null;
  } | null;
};
type DevProfile = 'superAdmin' | 'companyManager' | 'franchiseManager' | 'employee' | 'guest';
type BranchLite = { id: string; name: string; code: string; tenantId?: string };

/** Şube listesinden varsayılan: ana şube (HQ), yoksa ilk kayıt */
function pickDefaultBranchId(rows: BranchLite[]): string {
  if (!rows.length) return '';
  const hq = rows.find((b) => b.code?.toUpperCase() === 'HQ');
  return hq?.id ?? rows[0].id;
}

function syncBranchIdsForTenantRows(
  rows: BranchLite[],
  prevBranchId: string,
): { branchId: string; clearService: boolean } {
  const defaultId = pickDefaultBranchId(rows);
  const inList = rows.some((b) => b.id === prevBranchId);
  return {
    branchId: inList ? prevBranchId : defaultId,
    clearService: !inList,
  };
}

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
  /** Güzellik / sağlık */
  staffUser: { fullName: string } | null;
  /** RESTAURANT: alan adı (staffUser boş olabilir) */
  restaurantArea?: { name: string; code?: string; revenueLabel?: string | null } | null;
  branch: { name: string };
};

function formatReservationStaffOrArea(row: ReservationRow): string {
  if (row.staffUser?.fullName) return row.staffUser.fullName;
  const a = row.restaurantArea;
  if (!a?.name) return '—';
  if (a.revenueLabel) return `${a.name} (${a.revenueLabel})`;
  return a.code ? `${a.name} (${a.code})` : a.name;
}
type BranchPricingDayRow = {
  id: string;
  date: string;
  label: string | null;
  surchargePercent: number | null;
  extraAmount: number | null;
  note: string | null;
  isActive: boolean;
};
type ReservationStatusFilter = 'ALL' | 'PENDING' | 'CONFIRMED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
type LedgerTypeFilter = 'ALL' | 'INCOME' | 'CASH_IN';
type Vertical = 'BEAUTY' | 'HEALTH' | 'RESTAURANT';
type RoleRow = { id: string; code: string; name: string; description?: string };
type StaffCalendarRow = {
  staffUserId: string;
  staffName: string;
  offDay: boolean;
  shifts: Array<{ startsAt: string; endsAt: string }>;
  bookedCount: number;
  freeCount: number;
};
type TenantUserRow = {
  id: string;
  email: string;
  fullName: string;
  isStaff: boolean;
  status: string;
  branch?: { name: string; code: string } | null;
  staffProfile?: { specialty: string | null } | null;
  userRoles: Array<{ role: { code: string; name: string } }>;
};
type ScheduleRow = {
  id: string;
  startsAt: string;
  endsAt: string;
  staffUser?: { id: string; fullName: string; email: string } | null;
  branch: { id: string; name: string; code: string };
};

const APPLY_PURCHASE_STORAGE_KEY = 'appointment_apply_purchase_v1';
type PurchaseContext = {
  subscriptionId: string;
  tenantSlug: string;
  planCode: string;
  companyName: string;
  adminEmail: string;
};
function loadStoredPurchase(): PurchaseContext | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(APPLY_PURCHASE_STORAGE_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as PurchaseContext;
    if (p?.subscriptionId && p?.planCode) return p;
  } catch {
    /* ignore */
  }
  return null;
}

function paymentInvoiceLabel(paymentId: string) {
  return `INV-${paymentId.slice(0, 8).toUpperCase()}`;
}

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
/** Offline demo: API’deki gibi her kiracıda tek şube (HQ) — şube sayısı yanıltmasın diye hep 1 */
const fallbackTenants: TenantSummary[] = [
  { id: '1', name: 'Çankaya Ağız ve Diş Polikliniği', slug: 'ankara-clinic', vertical: 'HEALTH', branches: 1, subscriptionStatus: 'ACTIVE', planName: 'Orta ölçek' },
  { id: '2', name: 'Glow İzmir Güzellik Salonu', slug: 'izmir-beauty', vertical: 'BEAUTY', branches: 1, subscriptionStatus: 'TRIAL', planName: 'Başlangıç' },
  { id: '3', name: 'Bursa Kardiyoloji Polikliniği', slug: 'bursa-hospital', vertical: 'HEALTH', branches: 1, subscriptionStatus: 'PAST_DUE', planName: 'Kurumsal' },
  { id: '4', name: 'Bebek Boğaz Restoran', slug: 'istanbul-restaurant', vertical: 'RESTAURANT', branches: 1, subscriptionStatus: 'ACTIVE', planName: 'Orta ölçek' },
];

/** API kapalıyken anasayfa / başvuru paketleri (kodlar seed ile uyumlu) */
const FALLBACK_PLANS: Plan[] = [
  {
    id: 'fb-starter',
    code: 'STARTER_MONTHLY',
    name: 'Başlangıç',
    priceAmount: '1299',
    interval: 'MONTHLY',
    maxBranches: 2,
    maxStaff: 18,
    description: 'Küçük ve tek nokta işletmeler için giriş seviyesi paket.',
    trialDays: 14,
    maxAppointmentsMo: 3500,
    sortOrder: 1,
    isActive: true,
    stripeProductId: 'prod_UCDKAVRNr1ro2o',
    badgeLabel: null,
    featureLines: [
      'Tek ve çift şube; misafir rezervasyonu ve çalışan takvimi',
      'Bildirimler ve temel operasyon akışları',
      'Ön muhasebe / kasa kayıtları (paket kotasına göre)',
    ],
  },
  {
    id: 'fb-growth',
    code: 'GROWTH_MONTHLY',
    name: 'Orta ölçek',
    priceAmount: '3499',
    interval: 'MONTHLY',
    maxBranches: 12,
    maxStaff: 90,
    description: 'Büyüyen ve çok şubeli işletmeler için orta ölçek paket.',
    trialDays: 14,
    maxAppointmentsMo: 30000,
    sortOrder: 2,
    isActive: true,
    stripeProductId: 'prod_UCDKaBRouUUOdv',
    badgeLabel: 'En çok tercih edilen',
    featureLines: [
      'Çok şube yönetimi; şube bazlı hizmet ve roller',
      'Operasyon ekranı, atama ve durum takibi',
      'Raporlama ve faturalama entegrasyonuna hazır altyapı',
    ],
  },
  {
    id: 'fb-ent',
    code: 'ENTERPRISE_YEARLY',
    name: 'Kurumsal',
    priceAmount: '34999',
    interval: 'YEARLY',
    maxBranches: 999,
    maxStaff: 9999,
    description: 'Ülke çapı organizasyonlar ve yüksek iş hacmi için kurumsal paket.',
    trialDays: 30,
    maxAppointmentsMo: 500000,
    sortOrder: 3,
    isActive: true,
    stripeProductId: 'prod_UCDKfsX9j3LtRr',
    badgeLabel: null,
    featureLines: [
      'Yüksek şube ve personel kotası; büyük hacim randevu',
      'SLA, özel entegrasyon ve veri izolasyonu seçenekleri',
      'Havale/EFT ve Stripe ile platform üzerinden tahsilat',
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
  const [userModalMode, setUserModalMode] = useState<'employee' | 'manager' | null>(null);
  const [overview, setOverview] = useState<Overview>(fallbackOverview);
  const [tenants, setTenants] = useState<TenantSummary[]>(fallbackTenants);
  const [plans, setPlans] = useState<Plan[]>(FALLBACK_PLANS);
  const [payments, setPayments] = useState<RecentPayment[]>([]);
  const [platformBanks, setPlatformBanks] = useState<PlatformBankAccount[]>([]);
  const [adminPlans, setAdminPlans] = useState<Plan[]>([]);
  const [adminBanks, setAdminBanks] = useState<PlatformBankAccount[]>([]);
  const [localPlans, setLocalPlans] = useState<Plan[]>([]);
  const [localBanks, setLocalBanks] = useState<PlatformBankAccount[]>([]);
  const [stripeStatus, setStripeStatus] = useState<{ publishableKey: string; secretKeyConfigured: boolean } | null>(null);
  const [userCreateForm, setUserCreateForm] = useState({
    email: '',
    fullName: '',
    branchId: '',
    specialty: '',
  });
  const [tenantUsers, setTenantUsers] = useState<TenantUserRow[]>([]);
  const [branchCrudForm, setBranchCrudForm] = useState({ name: '', code: '', city: '' });
  const [scheduleRows, setScheduleRows] = useState<ScheduleRow[]>([]);
  const [opsBranchId, setOpsBranchId] = useState('');
  const [scheduleCreateForm, setScheduleCreateForm] = useState({ staffUserId: '', startsAt: '', endsAt: '' });
  const [serviceEditDraft, setServiceEditDraft] = useState<null | {
    id: string;
    name: string;
    durationMin: number;
    priceAmount: number;
  }>(null);
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
  const [restaurantPricingForm, setRestaurantPricingForm] = useState({
    branchId: '',
    dateYmd: '',
    surchargePercent: '15',
    extraAmount: '',
    label: '',
    note: '',
  });
  const [branchPricingDays, setBranchPricingDays] = useState<BranchPricingDayRow[]>([]);
  const [branchPricingDaysLoading, setBranchPricingDaysLoading] = useState(false);
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
    companyPhone: '',
    adminFullName: '',
    adminEmail: '',
    adminPassword: '',
    adminPasswordConfirm: '',
    planCode: '',
    defaultCurrency: 'TRY',
  });
  const [roleForm, setRoleForm] = useState({ code: '', name: '', description: '' });
  const [applicationType, setApplicationType] = useState<'company' | 'franchise'>('company');
  const [purchaseContext, setPurchaseContext] = useState<PurchaseContext | null>(() => {
    if (typeof window === 'undefined') return null;
    const p = window.location.pathname;
    return p === '/apply' || p === '/app/showcase' ? loadStoredPurchase() : null;
  });
  const [applyStep, setApplyStep] = useState(() => {
    if (typeof window === 'undefined') return 1;
    const p = window.location.pathname;
    if (p !== '/apply' && p !== '/app/showcase') return 1;
    return loadStoredPurchase() ? 5 : 1;
  });
  const [applyNeeds, setApplyNeeds] = useState({
    branchScale: '1' as '1' | '2-5' | '5+',
    teamScale: 'small' as 'small' | 'medium' | 'large',
    modules: { reservations: true, multiBranch: false, franchise: false, accounting: true },
  });
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [applyNotes, setApplyNotes] = useState('');
  const [applySubmitting, setApplySubmitting] = useState(false);
  const [paymentSubmitting, setPaymentSubmitting] = useState(false);
  const [stripeSubmitting, setStripeSubmitting] = useState(false);
  const stripeReturnHandledRef = useRef(false);
  const [tenantBilling, setTenantBilling] = useState<TenantBillingPayload | null>(null);
  const [tenantOverview, setTenantOverview] = useState<TenantOverviewPayload | null>(null);
  const [billingTabLoading, setBillingTabLoading] = useState(false);
  const [overviewTenantLoading, setOverviewTenantLoading] = useState(false);
  const [actionMessage, setActionMessage] = useState('');
  const [publicNavOpen, setPublicNavOpen] = useState(false);
  const [customerNotifs, setCustomerNotifs] = useState<NotificationRow[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [pricingHint, setPricingHint] = useState<{
    hasRule: boolean;
    label?: string;
    surchargePercent?: number | null;
    extraAmount?: number | null;
    note?: string | null;
  } | null>(null);
  /** Saat tıklanınca hemen API çağrısı yok; en alttaki talep formu ile gönderilir */
  const [pendingSlot, setPendingSlot] = useState<AvailabilitySlot | null>(null);
  const [reservationSubmitting, setReservationSubmitting] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  /** Paket satın alma sihirbazı: light arayüz, dashboard değil */
  const isSubscribeShowcasePath = location.pathname === '/app/showcase';
  const isAdminPath = location.pathname.startsWith('/app') && !isSubscribeShowcasePath;
  const isApplyWizardPath = location.pathname === '/apply' || isSubscribeShowcasePath;
  const isDev = import.meta.env.DEV;
  const DEV_ADMIN_LOGIN_KEY = 'appointment_admin_dev_login_v1';

  const t = translations[lang];

  /** Anasayfa + başvuru: yalnızca aktif paketler (STARTER_MONTHLY, GROWTH_MONTHLY, ENTERPRISE_YEARLY) */
  const visiblePlans = useMemo(() => plans.filter((p) => p.isActive !== false), [plans]);
  const recommendedPlanCode = useMemo(
    () => recommendPlanCode(visiblePlans, applicationType, applyNeeds),
    [visiblePlans, applicationType, applyNeeds],
  );
  const applyFeaturedPlanIdx = useMemo(
    () => (visiblePlans.length ? Math.floor((visiblePlans.length - 1) / 2) : 0),
    [visiblePlans.length],
  );
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
    if (!isApplyWizardPath) {
      setApplyStep(1);
      setTermsAccepted(false);
      return;
    }
    const pending = loadStoredPurchase();
    if (pending) {
      setPurchaseContext(pending);
      setApplyStep(5);
    }
  }, [location.pathname, isApplyWizardPath]);

  /** Stripe Checkout dönüşü (?stripe=1&session_id=...) */
  useEffect(() => {
    if (!isApplyWizardPath) return;
    const stripeFlag = searchParams.get('stripe');
    const sessionId = searchParams.get('session_id');
    if (stripeFlag !== '1' || !sessionId || stripeReturnHandledRef.current) return;
    stripeReturnHandledRef.current = true;
    let cancelled = false;
    (async () => {
      try {
        await apiPost<{ ok: boolean }>('/saas/stripe/complete-checkout', { sessionId });
        if (cancelled) return;
        sessionStorage.removeItem(APPLY_PURCHASE_STORAGE_KEY);
        setPurchaseContext(null);
        setApplyStep(1);
        setActionMessage(t.paymentCompleteSuccess);
        navigate(isSubscribeShowcasePath ? '/app/showcase' : '/apply', { replace: true });
      } catch {
        if (!cancelled) {
          stripeReturnHandledRef.current = false;
          setActionMessage(t.paymentFailed);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [location.pathname, searchParams, navigate, t.paymentCompleteSuccess, t.paymentFailed, isSubscribeShowcasePath]);

  /** Stripe iptal dönüşü */
  useEffect(() => {
    if (!isApplyWizardPath) return;
    if (searchParams.get('stripe_cancel') !== '1') return;
    const p = loadStoredPurchase();
    if (p) {
      setPurchaseContext(p);
      setApplyStep(5);
    }
    navigate(isSubscribeShowcasePath ? '/app/showcase' : '/apply', { replace: true });
  }, [location.pathname, searchParams, navigate, isApplyWizardPath, isSubscribeShowcasePath]);

  useEffect(() => {
    if (!isApplyWizardPath) return;
    const p = searchParams.get('plan');
    if (p && plans.some((pl) => pl.code === p)) {
      setOnboardForm((s) => ({ ...s, planCode: p }));
    }
  }, [location.pathname, searchParams, plans, isApplyWizardPath]);

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

  /** Geliştirme: tarayıcıda “hızlı giriş” tercihini hatırla */
  useEffect(() => {
    if (!isAdminPath || !isDev) return;
    try {
      if (window.localStorage.getItem(DEV_ADMIN_LOGIN_KEY) === '1') {
        setIsLoggedIn(true);
      }
    } catch {
      /* ignore */
    }
  }, [isAdminPath, isDev]);

  useEffect(() => {
    const onReservePage = !isAdminPath && location.pathname === '/reserve';
    const onAdminGuests = isAdminPath && tab === 'guests';
    if (!onReservePage && !onAdminGuests) return;
    if (!selectedTenantId || !guestForm.branchId || !guestForm.date) {
      setStaffCalendar([]);
      return;
    }
    const bundleId = guestDemoBundleTenantId(selectedTenantId, tenants);
    const useDemoCal =
      isDemoTenantId(selectedTenantId) || (bundleId != null && guestBranchesAreDemoPack(branches));
    if (useDemoCal && bundleId != null) {
      setStaffCalendar(
        buildDemoStaffCalendar({
          tenantId: bundleId,
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
  }, [isAdminPath, location.pathname, tab, selectedTenantId, tenants, branches, guestForm.branchId, guestForm.date, guestForm.serviceId]);

  const refreshSlots = useCallback(async () => {
    if (!selectedTenantId || !guestForm.branchId || !guestForm.serviceId || !guestForm.date) return;
    setSlotsLoading(true);
    try {
      const bundleId = guestDemoBundleTenantId(selectedTenantId, tenants);
      const useDemoSlots =
        isDemoTenantId(selectedTenantId) || (bundleId != null && guestBranchesAreDemoPack(branches));
      if (useDemoSlots && bundleId != null) {
        setAvailability(
          buildDemoAvailability({
            tenantId: bundleId,
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
  }, [selectedTenantId, tenants, branches, guestForm.branchId, guestForm.serviceId, guestForm.date, guestForm.staffUserId]);

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
    const ctx = location.pathname === '/reserve' || (isAdminPath && tab === 'guests');
    if (!ctx || !guestForm.date || !guestForm.branchId || !selectedTenantId) {
      setPricingHint(null);
      return;
    }
    const tenant = tenants.find((x) => x.id === selectedTenantId);
    if (tenant?.vertical !== 'RESTAURANT') {
      setPricingHint(null);
      return;
    }
    const bundleId = guestDemoBundleTenantId(selectedTenantId, tenants);
    const useDemoRestaurantHint =
      isDemoTenantId(selectedTenantId) || (bundleId != null && guestBranchesAreDemoPack(branches));
    if (useDemoRestaurantHint && bundleId != null) {
      setPricingHint(getDemoPricingHintForDate(guestForm.date));
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const h = await apiGetWithHeaders<{
          hasRule: boolean;
          label?: string;
          surchargePercent?: number | null;
          extraAmount?: number | null;
          note?: string | null;
        }>(
          `/guest/pricing-hint?branchId=${encodeURIComponent(guestForm.branchId)}&date=${encodeURIComponent(guestForm.date)}`,
          { 'x-tenant-id': selectedTenantId },
        );
        if (!cancelled) setPricingHint(h);
      } catch {
        if (!cancelled) setPricingHint(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [guestForm.date, guestForm.branchId, selectedTenantId, location.pathname, isAdminPath, tab, tenants, branches]);

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
        const [p, b, stripeCfg] = await Promise.all([
          apiGet<Plan[]>('/platform/plans'),
          apiGet<PlatformBankAccount[]>('/platform/bank-accounts'),
          apiGet<{ publishableKey: string; secretKeyConfigured: boolean }>('/saas/stripe/config').catch(() => null),
        ]);
        setAdminPlans(p);
        setAdminBanks(b);
        setStripeStatus(stripeCfg);
      } catch {
        setAdminPlans(FALLBACK_PLANS);
        setAdminBanks([]);
        setStripeStatus(null);
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

  const platformSubscriptionOptions = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of payments) {
      const sid = p.subscription?.id;
      if (sid && !m.has(sid)) {
        m.set(sid, `${p.subscription.tenant.name} — ${p.subscription.plan.name}`);
      }
    }
    return Array.from(m.entries()).map(([id, label]) => ({ id, label }));
  }, [payments]);

  const pathByTab: Record<TabKey, string> = {
    overview: '/app/overview',
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
    superAdmin: ['overview', 'billing', 'operations', 'guests', 'employees', 'managers', 'companyRoles', 'franchiseRoles', 'subRoles', 'services', 'assignment', 'accounting', 'saasPlans'],
    companyManager: ['overview', 'billing', 'operations', 'employees', 'managers', 'companyRoles', 'services', 'assignment', 'accounting'],
    franchiseManager: ['overview', 'billing', 'operations', 'employees', 'managers', 'franchiseRoles', 'services', 'assignment', 'accounting'],
    employee: ['overview', 'operations', 'guests', 'assignment'],
    guest: ['overview', 'billing', 'guests'],
  };
  const visibleTabs: TabKey[] = isLoggedIn ? allowedTabsByRole[devProfile] : ['overview', 'billing', 'guests'];

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

  /** Kiracı listesi değişince (API vs demo) seçili id geçersizse ilk kiracıya dön */
  useEffect(() => {
    if (tenants.length === 0) return;
    const valid = tenants.some((x) => x.id === selectedTenantId);
    if (!valid) {
      setSelectedTenantId(tenants[0].id);
    }
  }, [tenants, selectedTenantId]);

  useEffect(() => {
    async function loadBranches() {
      if (!selectedTenantId) return;
      if (isDemoTenantId(selectedTenantId)) {
        const demo = getDemoBranches(selectedTenantId);
        setBranches(demo);
        if (demo.length) {
          setServiceForm((prev) => {
            const s = syncBranchIdsForTenantRows(demo, prev.branchId);
            return { ...prev, branchId: s.branchId };
          });
          setGuestForm((prev) => {
            const s = syncBranchIdsForTenantRows(demo, prev.branchId);
            return {
              ...prev,
              branchId: s.branchId,
              serviceId: s.clearService ? '' : prev.serviceId,
              staffUserId: s.clearService ? '' : prev.staffUserId,
            };
          });
        } else {
          setBranches([]);
          setGuestForm((prev) => ({ ...prev, branchId: '', serviceId: '', staffUserId: '' }));
        }
        return;
      }

      const applyFromRows = (rows: BranchLite[]) => {
        setBranches(rows);
        if (rows.length) {
          setServiceForm((prev) => {
            const s = syncBranchIdsForTenantRows(rows, prev.branchId);
            return { ...prev, branchId: s.branchId };
          });
          setGuestForm((prev) => {
            const s = syncBranchIdsForTenantRows(rows, prev.branchId);
            return {
              ...prev,
              branchId: s.branchId,
              serviceId: s.clearService ? '' : prev.serviceId,
              staffUserId: s.clearService ? '' : prev.staffUserId,
            };
          });
        } else {
          setGuestForm((prev) => ({ ...prev, branchId: '', serviceId: '', staffUserId: '' }));
        }
      };

      try {
        const raw = await apiGet<BranchLite[]>(
          `/guest/branches?tenantId=${encodeURIComponent(selectedTenantId)}`,
        );
        const rows = Array.isArray(raw) ? raw : [];
        if (rows.length === 0) {
          const slug = tenants.find((t) => t.id === selectedTenantId)?.slug;
          const dId = slugToDemoTenantId(slug);
          if (dId) {
            applyFromRows(getDemoBranches(dId));
          } else {
            applyFromRows([]);
          }
        } else {
          applyFromRows(rows);
        }
      } catch {
        const slug = tenants.find((t) => t.id === selectedTenantId)?.slug;
        const dId = slugToDemoTenantId(slug);
        if (dId) {
          applyFromRows(getDemoBranches(dId));
        } else {
          setBranches([]);
          setGuestForm((prev) => ({ ...prev, branchId: '', serviceId: '', staffUserId: '' }));
        }
      }
    }
    loadBranches();
  }, [selectedTenantId, tenants]);

  const reloadSchedules = useCallback(async () => {
    if (!selectedTenantId || isDemoTenantId(selectedTenantId) || !opsBranchId) return;
    const from = new Date();
    const to = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
    try {
      const rows = await apiGetWithHeaders<ScheduleRow[]>(
        `/schedules?branchId=${encodeURIComponent(opsBranchId)}&from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}`,
        { 'x-tenant-id': selectedTenantId },
      );
      setScheduleRows(Array.isArray(rows) ? rows : []);
    } catch {
      setScheduleRows([]);
    }
  }, [selectedTenantId, opsBranchId]);

  const refreshBranches = useCallback(async () => {
    if (!selectedTenantId) return;
    if (isDemoTenantId(selectedTenantId)) {
      const demo = getDemoBranches(selectedTenantId);
      setBranches(demo);
      return;
    }
    try {
      const raw = await apiGet<BranchLite[]>(
        `/guest/branches?tenantId=${encodeURIComponent(selectedTenantId)}`,
      );
      setBranches(Array.isArray(raw) ? raw : []);
    } catch {
      setBranches([]);
    }
  }, [selectedTenantId]);

  /**
   * Rezervasyon ekranı şubeleri.
   * Demo: paket verisi. API: GET /guest/branches?tenantId=…
   * tenantId filtre sonucu boşsa API listesine güven (aynı kiracı).
   */
  const reserveBranches = useMemo(() => {
    if (!selectedTenantId) return [];
    if (isDemoTenantId(selectedTenantId)) {
      return getDemoBranches(selectedTenantId);
    }
    const hasAnyTenantId = branches.some((b) => b.tenantId != null && b.tenantId !== '');
    if (!hasAnyTenantId) {
      return branches;
    }
    const filtered = branches.filter((b) => b.tenantId === selectedTenantId);
    return filtered.length > 0 ? filtered : branches;
  }, [selectedTenantId, branches]);

  useEffect(() => {
    const ids = new Set(reserveBranches.map((b) => b.id));
    if (guestForm.branchId && reserveBranches.length > 0 && !ids.has(guestForm.branchId)) {
      const next = pickDefaultBranchId(reserveBranches);
      setGuestForm((prev) => ({ ...prev, branchId: next, serviceId: '', staffUserId: '' }));
    }
  }, [reserveBranches, guestForm.branchId]);

  useEffect(() => {
    async function loadCatalogServices() {
      const catalogBranchId = tab === 'services' ? serviceForm.branchId : guestForm.branchId;
      if (!selectedTenantId || !catalogBranchId) return;
      const bundleId = guestDemoBundleTenantId(selectedTenantId, tenants);
      const useSeedDemoServices =
        isDemoTenantId(selectedTenantId) || (bundleId != null && guestBranchesAreDemoPack(branches));

      if (useSeedDemoServices && bundleId != null) {
        const rows = getDemoServicesForBranch(bundleId, catalogBranchId);
        setBranchServices(rows);
        setGuestForm((prev) => {
          const ok = rows.some((s) => s.id === prev.serviceId);
          const nextSid = ok ? prev.serviceId : (rows[0]?.id ?? '');
          if (nextSid === prev.serviceId) return prev;
          return { ...prev, serviceId: nextSid, staffUserId: '' };
        });
      } else {
        try {
          const rows = await apiGetWithHeaders<ServiceLite[]>(
            `/services?branchId=${catalogBranchId}`,
            { 'x-tenant-id': selectedTenantId },
          );
          setBranchServices(rows);
          if (tab !== 'services') {
            setGuestForm((prev) => {
              const ok = rows.some((s) => s.id === prev.serviceId);
              const nextSid = ok ? prev.serviceId : (rows[0]?.id ?? '');
              if (nextSid === prev.serviceId) return prev;
              return { ...prev, serviceId: nextSid, staffUserId: ok ? prev.staffUserId : '' };
            });
          }
        } catch {
          setBranchServices([]);
        }
      }
    }
    async function loadLedgerReservationsRoles() {
      if (!selectedTenantId) return;
      if (isDemoTenantId(selectedTenantId)) {
        setLedger([]);
        setReservations([]);
        setRoles([]);
        return;
      }
      const reservationQuery = reservationStatusFilter === 'ALL' ? '' : `?status=${reservationStatusFilter}`;
      const ledgerQuery = ledgerTypeFilter === 'ALL' ? '' : `?type=${ledgerTypeFilter}`;
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
    }
    void loadCatalogServices();
    void loadLedgerReservationsRoles();
  }, [
    selectedTenantId,
    tenants,
    branches,
    guestForm.branchId,
    guestForm.serviceId,
    serviceForm.branchId,
    tab,
    reservationStatusFilter,
    ledgerTypeFilter,
  ]);

  useEffect(() => {
    if (!selectedTenantId || isDemoTenantId(selectedTenantId)) {
      setTenantUsers([]);
      return;
    }
    if (!['employees', 'managers', 'operations', 'services', 'assignment'].includes(tab)) return;
    let cancelled = false;
    void (async () => {
      try {
        const rows = await apiGetWithHeaders<TenantUserRow[]>('/tenants/users', { 'x-tenant-id': selectedTenantId });
        if (!cancelled) setTenantUsers(rows);
      } catch {
        if (!cancelled) setTenantUsers([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedTenantId, tab]);

  useEffect(() => {
    if (branches[0] && !opsBranchId) {
      setOpsBranchId(branches[0].id);
    }
  }, [branches, opsBranchId]);

  useEffect(() => {
    if (tab !== 'operations' || !selectedTenantId || isDemoTenantId(selectedTenantId) || !opsBranchId) {
      setScheduleRows([]);
      return;
    }
    void reloadSchedules();
  }, [tab, selectedTenantId, opsBranchId, reloadSchedules]);

  const selectedTenant = tenants.find((x) => x.id === selectedTenantId);
  const useRestaurantAreas = selectedTenant?.vertical === 'RESTAURANT';
  const actorEmail = selectedTenant ? `owner@${selectedTenant.slug}.com` : 'owner@demo-tenant.com';

  const adminTabDocumentTitle = useMemo(
    () => ({
      overview: t.overview,
      billing: t.billing,
      operations: t.operations,
      guests: t.guests,
      employees: t.employees,
      managers: t.managers,
      companyRoles: t.companyRoles,
      franchiseRoles: t.franchiseRoles,
      subRoles: t.subRoles,
      services: t.services,
      assignment: t.assignment,
      accounting: t.accounting,
      saasPlans: t.saasPlans,
    }),
    [t],
  );

  const reloadBranchPricingDays = useCallback(async () => {
    if (!selectedTenantId || isDemoTenantId(selectedTenantId) || !restaurantPricingForm.branchId) {
      setBranchPricingDays([]);
      return;
    }
    setBranchPricingDaysLoading(true);
    try {
      const rows = await apiGetWithHeaders<BranchPricingDayRow[]>(
        `/employee/branch-pricing-days?branchId=${encodeURIComponent(restaurantPricingForm.branchId)}`,
        { 'x-tenant-id': selectedTenantId },
      );
      setBranchPricingDays(rows);
    } catch {
      setBranchPricingDays([]);
    } finally {
      setBranchPricingDaysLoading(false);
    }
  }, [selectedTenantId, restaurantPricingForm.branchId]);

  useEffect(() => {
    if (isAdminPath) {
      if (!isLoggedIn) {
        document.title = `${t.loginRequiredTitle} · ${t.appTitle}`;
        return;
      }
      const section = adminTabDocumentTitle[tab];
      document.title = section ? `${section} · ${t.appTitle}` : t.appTitle;
      return;
    }
    if (location.pathname === '/reserve') {
      document.title = `${t.reserveSectionTitle} · ${t.appTitle}`;
      return;
    }
    if (location.pathname === '/') {
      document.title = `${t.publicHeroTitle} · ${t.appTitle}`;
      return;
    }
    document.title = t.appTitle;
  }, [
    isAdminPath,
    isLoggedIn,
    tab,
    location.pathname,
    t.appTitle,
    t.loginRequiredTitle,
    t.publicHeroTitle,
    t.reserveSectionTitle,
    adminTabDocumentTitle,
  ]);

  useEffect(() => {
    if (isAdminPath) return;
    let meta = document.querySelector('meta[name="description"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.setAttribute('name', 'description');
      document.head.appendChild(meta);
    }
    const desc =
      location.pathname === '/reserve' ? t.reserveMetaDescription : t.landingMetaDescription;
    meta.setAttribute('content', desc);
  }, [isAdminPath, location.pathname, t.landingMetaDescription, t.reserveMetaDescription]);

  useEffect(() => {
    if (tab !== 'operations' || !useRestaurantAreas) return;
    void reloadBranchPricingDays();
  }, [tab, useRestaurantAreas, reloadBranchPricingDays]);

  useEffect(() => {
    if (!useRestaurantAreas || branches.length === 0) return;
    setRestaurantPricingForm((s) =>
      s.branchId
        ? s
        : {
            ...s,
            branchId: branches[0].id,
            dateYmd: s.dateYmd || getDemoSpecialPricingDateYmd(),
            label: s.label || (lang === 'tr' ? 'Önemli gün' : 'Special day'),
          },
    );
  }, [useRestaurantAreas, branches, lang]);

  useEffect(() => {
    if (!isAdminPath || tab !== 'billing' || devProfile === 'superAdmin') {
      setTenantBilling(null);
      return;
    }
    if (!selectedTenant?.slug) return;
    let cancelled = false;
    setBillingTabLoading(true);
    void (async () => {
      try {
        const data = await apiGet<TenantBillingPayload>(
          `/saas/tenant-billing?tenantSlug=${encodeURIComponent(selectedTenant.slug)}`,
        );
        if (!cancelled) setTenantBilling(data);
      } catch {
        if (!cancelled) setTenantBilling(null);
      } finally {
        if (!cancelled) setBillingTabLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isAdminPath, tab, devProfile, selectedTenant?.slug]);

  useEffect(() => {
    if (!isAdminPath || tab !== 'overview' || devProfile === 'superAdmin') {
      setTenantOverview(null);
      return;
    }
    if (!selectedTenant?.slug) return;
    let cancelled = false;
    setOverviewTenantLoading(true);
    void (async () => {
      try {
        const data = await apiGet<TenantOverviewPayload>(
          `/saas/tenant-overview?tenantSlug=${encodeURIComponent(selectedTenant.slug)}`,
        );
        if (!cancelled) setTenantOverview(data);
      } catch {
        if (!cancelled) setTenantOverview(null);
      } finally {
        if (!cancelled) setOverviewTenantLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isAdminPath, tab, devProfile, selectedTenant?.slug]);

  const slotGroups = useMemo(() => groupSlotsByPeriod(availability), [availability]);

  const bookingStep = useMemo(() => {
    if (!guestForm.branchId) return 1;
    if (!guestForm.serviceId) return 2;
    if (!guestForm.date || !pendingSlot) return 3;
    return 4;
  }, [guestForm.branchId, guestForm.serviceId, guestForm.date, pendingSlot]);

  useEffect(() => {
    setPendingSlot(null);
  }, [guestForm.branchId, guestForm.serviceId, guestForm.date, guestForm.staffUserId]);

  useEffect(() => {
    if (!pendingSlot || slotsLoading) return;
    const stillThere = availability.some(
      (s) => s.startsAt === pendingSlot.startsAt && s.staffUserId === pendingSlot.staffUserId,
    );
    if (!stillThere) setPendingSlot(null);
  }, [availability, pendingSlot, slotsLoading]);

  const isSlotSelected = useCallback(
    (slot: AvailabilitySlot) =>
      pendingSlot?.startsAt === slot.startsAt && pendingSlot?.staffUserId === slot.staffUserId,
    [pendingSlot],
  );

  const pickPublicSlot = useCallback((slot: AvailabilitySlot) => {
    setPendingSlot((prev) => {
      const same = prev?.startsAt === slot.startsAt && prev?.staffUserId === slot.staffUserId;
      if (same) return null;
      queueMicrotask(() => {
        document.getElementById('booking-contact')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
      return slot;
    });
  }, []);

  const submitReservationRequest = useCallback(async () => {
    if (!selectedTenantId) return;
    const slot = pendingSlot;
    if (!slot) {
      setActionMessage(t.reserveSelectSlotFirst);
      document.getElementById('reserve-step-3')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    if (!guestForm.customerName.trim() || !guestForm.customerPhone.trim()) {
      setActionMessage(t.invalidForm);
      document.getElementById('booking-contact')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    setReservationSubmitting(true);
    try {
      const bundleId = guestDemoBundleTenantId(selectedTenantId, tenants);
      const simulateDemoSuccess =
        isDemoTenantId(selectedTenantId) || (bundleId != null && guestBranchesAreDemoPack(branches));
      if (simulateDemoSuccess) {
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
    } catch (err) {
      setActionMessage(`${t.reserveFail}: ${getApiErrorMessage(err)}`);
    } finally {
      setReservationSubmitting(false);
    }
  }, [
    selectedTenantId,
    tenants,
    branches,
    actorEmail,
    lang,
    pendingSlot,
    guestForm.branchId,
    guestForm.customerName,
    guestForm.customerPhone,
    guestForm.customerEmail,
    guestForm.serviceId,
    t.reserveSuccess,
    t.reserveFail,
    t.invalidForm,
    t.reserveSelectSlotFirst,
  ]);

  const publicReserveSummary = useMemo(() => {
    const br = reserveBranches.find((b) => b.id === guestForm.branchId);
    const svc = branchServices.find((s) => s.id === guestForm.serviceId);
    const dateFmt = guestForm.date
      ? new Date(`${guestForm.date}T12:00:00`).toLocaleDateString(lang === 'tr' ? 'tr-TR' : 'en-US', {
          weekday: 'short',
          day: 'numeric',
          month: 'short',
        })
      : '';
    const timeFmt = pendingSlot
      ? new Date(pendingSlot.startsAt).toLocaleTimeString(lang === 'tr' ? 'tr-TR' : 'en-US', { hour: '2-digit', minute: '2-digit' })
      : '';
    return {
      branchName: br?.name ?? '',
      serviceName: svc?.name ?? '',
      serviceMeta: svc ? `${svc.durationMin}′ · ₺${svc.priceAmount} ${svc.currency}` : '',
      dateFmt,
      timeFmt,
      staffName: pendingSlot?.staffName ?? '',
    };
  }, [reserveBranches, branchServices, guestForm.branchId, guestForm.serviceId, guestForm.date, pendingSlot, lang]);

  const applyPriceHint = (baseNum: number) => {
    if (!pricingHint?.hasRule) return Math.round(baseNum);
    let n = baseNum;
    if (pricingHint.surchargePercent != null) n *= 1 + pricingHint.surchargePercent / 100;
    if (pricingHint.extraAmount != null) n += Number(pricingHint.extraAmount);
    return Math.round(n);
  };

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
  const staffUserOptions = useMemo(
    () => tenantUsers.filter((u) => u.isStaff).map((u) => ({ id: u.id, name: u.fullName })),
    [tenantUsers],
  );
  const opsStaffSelect = useMemo(() => {
    if (selectedTenantId && isDemoTenantId(selectedTenantId)) return staffOptions;
    return staffUserOptions.length > 0 ? staffUserOptions : staffOptions;
  }, [selectedTenantId, staffOptions, staffUserOptions]);
  const canApprove = (status: string) => status === 'PENDING';
  const canStart = (status: string) => status === 'CONFIRMED';
  const canComplete = (status: string) => status === 'IN_PROGRESS';
  const canCancelReservation = (status: string) => status === 'PENDING' || status === 'CONFIRMED';
  const selectedPlan = plans.find((p) => p.code === onboardForm.planCode) ?? plans[0];
  const purchasePlan = useMemo(
    () => (purchaseContext ? plans.find((p) => p.code === purchaseContext.planCode) : undefined),
    [plans, purchaseContext],
  );
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

    const applyReturnPath = location.pathname === '/app/showcase' ? '/app/showcase' : '/apply';

    const activeHero = heroSlides[activeSlide];
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
              <button type="button" className="ghostBtn" onClick={() => goPublic('/app/showcase')}>{t.navApply}</button>
              <button type="button" className="ghostBtn" onClick={() => goPublic('/#faq')}>{t.navFaq}</button>
            </nav>
            <div className="publicHeaderEnd">
              <button
                type="button"
                className="primaryBtn publicReserveCta"
                onClick={() => goPublic('/reserve')}
                aria-label={t.navReserve}
              >
                <CalendarClock size={18} strokeWidth={2} aria-hidden />
                <span className="publicReserveCtaLabel">{t.navReserve}</span>
              </button>
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
                      <button type="button" className="landingBtn landingBtnGhost" onClick={() => goPublic('/app/showcase')}>
                        {t.landingHeroCtaSecondary}
                      </button>
                      <button type="button" className="landingBtn landingBtnOutline landingBtnOnDark" onClick={() => goPublic('/reserve')}>
                        <CalendarClock size={18} aria-hidden />
                        {t.landingHeroCtaReserve}
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
                <div className="landingSectionCta">
                  <button type="button" className="landingBtn landingBtnPrimary" onClick={() => goPublic('/reserve')}>
                    <CalendarClock size={18} aria-hidden />
                    {t.landingServiceCtaReserve}
                    <ArrowRight size={18} aria-hidden />
                  </button>
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
                  {visiblePlans.map((plan, idx) => {
                    const lines = planFeatureLines(plan, t);
                    const featured = plan.badgeLabel ? plan.badgeLabel.includes('En çok') || plan.badgeLabel.toLowerCase().includes('popular') : idx === applyFeaturedPlanIdx;
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
                        <p className="landingPriceSku">
                          <code>{plan.code}</code>
                        </p>
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
                            goPublic(`/app/showcase?plan=${encodeURIComponent(plan.code)}`);
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
                    <button type="button" className="landingBtn landingBtnOnDark" onClick={() => goPublic('/app/showcase')}>
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
                    <button type="button" className="landingFooterLink" onClick={() => goPublic('/app/overview')}>{t.openAdmin}</button>
                    <button type="button" className="landingFooterLink" onClick={() => goPublic('/app/showcase')}>{t.navApply}</button>
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
          <div className="reservePageShell">
            <div className="reservePageHeroBand">
              <div className="reservePageInner">
                {isDemoTenantId(selectedTenantId) ? (
                  <div className="reserveDemoBanner" role="status">
                    <strong>Demo</strong>
                    <span>{t.demoDataBanner}</span>
                  </div>
                ) : null}
                <header className="reserveHero">
                  <div className="reserveHeroTop">
                    <button type="button" className="reserveBackHome" onClick={() => goPublic('/')}>
                      <ChevronLeft size={18} aria-hidden />
                      {t.reserveBackHome}
                    </button>
                  </div>
                  <h3 className="reserveFlowTitle">
                    <CalendarClock className="reserveHeroTitleGlyph" size={28} strokeWidth={1.75} aria-hidden />
                    <span>{t.reserveSectionTitle}</span>
                  </h3>
                  <p className="muted reserveHeroLead">{t.reserveHeroLead}</p>
                  <p className="reserveSlotsAutoHint">{t.reserveSlotsAuto}</p>
                </header>
              </div>
            </div>

            <div className="reservePageMain reserveFlow reserveFlow--public">
              <div className="reservePageStickyWrap">
                <div className="reservePageInner">
                  <div className="reserveStickyBar">
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

                <div className="reserveLiveSummary" aria-live="polite">
                  <div className="reserveLiveSummaryHead">
                    <span className="reserveLiveSummaryTitle">{t.reserveSummaryTitle}</span>
                    <span className="reserveLiveSummaryTenant">{selectedTenant?.name ?? '—'}</span>
                  </div>
                  <div className="reserveLiveSummaryGrid">
                    <div className="reserveLiveSummaryCell">
                      <span className="reserveLiveSummaryLbl">{t.selectBranch}</span>
                      <span className="reserveLiveSummaryVal">{publicReserveSummary.branchName || '—'}</span>
                    </div>
                    <div className="reserveLiveSummaryCell">
                      <span className="reserveLiveSummaryLbl">{t.selectService}</span>
                      <span className="reserveLiveSummaryVal">{publicReserveSummary.serviceName || '—'}</span>
                    </div>
                    <div className="reserveLiveSummaryCell">
                      <span className="reserveLiveSummaryLbl">{t.selectDate}</span>
                      <span className="reserveLiveSummaryVal">{publicReserveSummary.dateFmt || '—'}</span>
                    </div>
                    <div className="reserveLiveSummaryCell">
                      <span className="reserveLiveSummaryLbl">{t.reservePickSlot}</span>
                      <span className="reserveLiveSummaryVal">
                        {pendingSlot ? `${publicReserveSummary.timeFmt} · ${publicReserveSummary.staffName}` : '—'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

                  <p className="reserveUxTip muted">{t.reserveUxTip}</p>
                </div>
              </div>

              <div className="reservePageStepList">
                <div className="reservePageInner">
              <div id="reserve-step-1" className="reserveBlock reserveSectionCard reserveSectionCard--branch">
                <h4 className="reserveBlockTitle">
                  <span className="reserveBlockIcon reserveBlockIcon--branch" aria-hidden>
                    <Building2 size={22} strokeWidth={1.85} />
                  </span>
                  <span className="reserveBlockNum">1</span>
                  {t.reserveStep1}
                </h4>
                <label className="reserveLabel">
                  {t.selectTenant}
                  <select
                    className="reserveTenantSelect"
                    value={selectedTenantId}
                    onChange={(e) => setSelectedTenantId(e.target.value)}
                  >
                    {tenants.map((tenant) => (
                      <option key={tenant.id} value={tenant.id}>
                        {tenant.name}
                      </option>
                    ))}
                  </select>
                </label>
                <p className="reserveBlockSub">{t.selectBranch}</p>
                <div className="reserveBranchGrid">
                  {reserveBranches.length === 0 ? (
                    <p className="muted reserveBranchEmpty">{t.reserveNoBranches}</p>
                  ) : (
                    reserveBranches.map((b) => (
                      <button
                        key={b.id}
                        type="button"
                        className={`reserveBranchCard ${guestForm.branchId === b.id ? 'isSelected' : ''}`}
                        onClick={() => setGuestForm((s) => ({ ...s, branchId: b.id, staffUserId: '', serviceId: '' }))}
                      >
                        <Building2 size={22} aria-hidden />
                        <span className="reserveBranchName">{b.name}</span>
                        <span className="reserveBranchCode">
                          {b.code}
                          {b.code?.toUpperCase() === 'HQ' ? <span className="reserveBranchHqBadge">{t.mainBranchBadge}</span> : null}
                        </span>
                      </button>
                    ))
                  )}
                </div>
              </div>

              <div id="reserve-step-2" className="reserveBlock reserveSectionCard reserveSectionCard--service">
                <h4 className="reserveBlockTitle">
                  <span className="reserveBlockIcon reserveBlockIcon--service" aria-hidden>
                    <BriefcaseBusiness size={22} strokeWidth={1.85} />
                  </span>
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
                      <span className="reserveServiceCardIcon" aria-hidden>
                        <Sparkles size={18} strokeWidth={1.85} />
                      </span>
                      <span className="reserveServiceName">{s.name}</span>
                      {s.category?.name ? <span className="reserveServiceCat">{s.category.name}</span> : null}
                      <span className="reserveServiceMeta">
                        {useRestaurantAreas && pricingHint?.hasRule ? (
                          <>
                            {s.durationMin}′ ·{' '}
                            <span className="reserveStrike">₺{s.priceAmount}</span>{' '}
                            <strong>₺{applyPriceHint(Number(s.priceAmount))}</strong> {s.currency}
                            {pricingHint.label ? (
                              <span className="reservePricingBadge" title={pricingHint.note ?? ''}>
                                {pricingHint.label}
                              </span>
                            ) : null}
                          </>
                        ) : (
                          <>
                            {s.durationMin}′ · ₺{s.priceAmount} {s.currency}
                          </>
                        )}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              <div id="reserve-step-3" className="reserveBlock reserveSectionCard reserveSectionCard--datetime">
                <h4 className="reserveBlockTitle">
                  <span className="reserveBlockIcon reserveBlockIcon--datetime" aria-hidden>
                    <Calendar size={22} strokeWidth={1.85} />
                  </span>
                  <span className="reserveBlockNum">3</span>
                  {t.reserveStep3}
                </h4>
                <p className="reserveShiftHint">{useRestaurantAreas ? t.restaurantAreaShiftHint : t.shiftBreak}</p>
                <div className="reserveSubCard reserveSubCard--calendar">
                  <div className="reserveSubCardHead">
                    <CalendarClock size={18} aria-hidden />
                    <span>{t.reserveCalendarWeek}</span>
                  </div>
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
                </div>

                <div className="reserveSubCard reserveSubCard--staff">
                  <div className="reserveSubCardHead">
                    <Users size={18} aria-hidden />
                    <span>{useRestaurantAreas ? t.chooseRestaurantArea : t.chooseStaff}</span>
                  </div>
                <div className="reserveStaffChips" role="group" aria-label={useRestaurantAreas ? t.chooseRestaurantArea : t.chooseStaff}>
                  <button
                    type="button"
                    className={`reserveStaffChip ${guestForm.staffUserId === '' ? 'isSelected' : ''}`}
                    onClick={() => setGuestForm((s) => ({ ...s, staffUserId: '' }))}
                  >
                    {useRestaurantAreas ? t.anyRestaurantArea : t.anyStaff}
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
                </div>

                <details className="reserveStaffDetails">
                  <summary className="reserveStaffDetailsSummary">
                    {useRestaurantAreas ? t.restaurantAreaDetailsToggle : t.reserveStaffCalendarToggle}
                  </summary>
                  <h5 className="reserveSubheading">{useRestaurantAreas ? t.restaurantAreaCalendar : t.staffCalendar}</h5>
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
                </details>

                <div className="reserveSubCard reserveSubCard--slots">
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
                  <p className="reservePickSlotHint">{t.reservePickSlotHint}</p>
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
                            className={`reserveSlotChip ${isSlotSelected(slot) ? 'isSelected' : ''}`}
                            onClick={() => pickPublicSlot(slot)}
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
                            className={`reserveSlotChip ${isSlotSelected(slot) ? 'isSelected' : ''}`}
                            onClick={() => pickPublicSlot(slot)}
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
                            className={`reserveSlotChip ${isSlotSelected(slot) ? 'isSelected' : ''}`}
                            onClick={() => pickPublicSlot(slot)}
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
              </div>

              <div id="booking-contact" className="reserveBlock reserveSectionCard reserveSectionCard--contact reserveRequestBlock">
                <h4 className="reserveBlockTitle">
                  <span className="reserveBlockIcon reserveBlockIcon--contact" aria-hidden>
                    <Send size={22} strokeWidth={1.85} />
                  </span>
                  <span className="reserveBlockNum">4</span>
                  {t.reserveRequestTitle}
                </h4>
                <div className="reserveRequestSummary" aria-live="polite">
                  <p className="reserveRequestSummaryTitle">{t.reserveSummaryTitle}</p>
                  <ul className="reserveRequestSummaryList">
                    <li>
                      <span className="reserveRequestSummaryKey">{t.selectTenant}</span>
                      <span className="reserveRequestSummaryVal">{selectedTenant?.name ?? '—'}</span>
                    </li>
                    <li>
                      <span className="reserveRequestSummaryKey">{t.selectBranch}</span>
                      <span className="reserveRequestSummaryVal">{publicReserveSummary.branchName || '—'}</span>
                    </li>
                    <li>
                      <span className="reserveRequestSummaryKey">{t.selectService}</span>
                      <span className="reserveRequestSummaryVal">
                        {publicReserveSummary.serviceName ? `${publicReserveSummary.serviceName} (${publicReserveSummary.serviceMeta})` : '—'}
                      </span>
                    </li>
                    <li>
                      <span className="reserveRequestSummaryKey">{t.selectDate}</span>
                      <span className="reserveRequestSummaryVal">{publicReserveSummary.dateFmt || '—'}</span>
                    </li>
                    <li>
                      <span className="reserveRequestSummaryKey">{t.reservePickSlot}</span>
                      <span className="reserveRequestSummaryVal">
                        {pendingSlot ? `${publicReserveSummary.timeFmt} · ${publicReserveSummary.staffName}` : '—'}
                      </span>
                    </li>
                  </ul>
                </div>

                <div className="reserveFormCenter">
                <p className="reserveContactSectionLabel">{t.reserveContactTitle}</p>
                <div className="formGrid reserveContactGrid">
                  <label className="reserveLabel reserveLabel--icon">
                    <span className="reserveLabelText">
                      <User size={16} strokeWidth={2} aria-hidden />
                      {t.name}
                    </span>
                    <input value={guestForm.customerName} onChange={(e) => setGuestForm((s) => ({ ...s, customerName: e.target.value }))} autoComplete="name" />
                  </label>
                  <label className="reserveLabel reserveLabel--icon">
                    <span className="reserveLabelText">
                      <Phone size={16} strokeWidth={2} aria-hidden />
                      {t.phone}
                    </span>
                    <input
                      type="tel"
                      inputMode="tel"
                      value={guestForm.customerPhone}
                      onChange={(e) => setGuestForm((s) => ({ ...s, customerPhone: e.target.value }))}
                      autoComplete="tel"
                    />
                  </label>
                  <label className="reserveLabel reserveLabel--icon reserveSpan2">
                    <span className="reserveLabelText">
                      <Mail size={16} strokeWidth={2} aria-hidden />
                      {t.email}
                    </span>
                    <input type="email" value={guestForm.customerEmail} onChange={(e) => setGuestForm((s) => ({ ...s, customerEmail: e.target.value }))} autoComplete="email" />
                  </label>
                </div>

                <button
                  type="button"
                  className="reserveSubmitBtn"
                  disabled={
                    reservationSubmitting ||
                    !pendingSlot ||
                    !guestForm.customerName.trim() ||
                    !guestForm.customerPhone.trim()
                  }
                  onClick={() => void submitReservationRequest()}
                >
                  {reservationSubmitting ? <Loader2 size={20} className="reserveSpin" aria-hidden /> : <Send size={20} aria-hidden />}
                  {reservationSubmitting ? t.reserveSending : t.reserveSubmit}
                </button>
                {!pendingSlot ? <p className="reserveSubmitHint muted">{t.reserveSelectSlotFirst}</p> : null}
                </div>

                <details className="reserveNotifyDetails">
                  <summary>{t.reserveNotifyToggle}</summary>
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
                </details>
              </div>
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {isApplyWizardPath ? (
          <div className="publicContent publicPagePad publicApply">
            <section className="card applyFlow">
              <div className="applyHero">
                {location.pathname === '/app/showcase' ? (
                  <p className="applyShowcaseBadge">{t.subscribeShowcaseBadge}</p>
                ) : null}
                <h2 className="applyTitle">{t.applyWizardTitle}</h2>
                <p className="muted applyLead">{t.applyWizardLead}</p>
              </div>
              <div className="applyStepper" aria-label="Application steps">
                {[
                  { n: 1, label: t.applyStep1Title },
                  { n: 2, label: t.applyStep2Title },
                  { n: 3, label: t.applyStep3Title },
                  { n: 4, label: t.applyStep4Title },
                  { n: 5, label: t.applyStep5Title },
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
                  <div className="applyVerticalGrid applyVerticalGrid--3">
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
                    <button
                      type="button"
                      className={`applyVerticalCard ${onboardForm.vertical === 'RESTAURANT' ? 'isSelected' : ''}`}
                      onClick={() => setOnboardForm((s) => ({ ...s, vertical: 'RESTAURANT' }))}
                    >
                      <Utensils size={22} aria-hidden />
                      {t.applyVerticalRestaurant}
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
                    {visiblePlans.find((p) => p.code === recommendedPlanCode)?.name ?? recommendedPlanCode}
                    <span className="applyRecommendHint">{t.applyRecommendedHint}</span>
                  </div>
                </div>
              ) : null}

              {applyStep === 3 ? (
                <div className="applyStepBlock">
                  <h3 className="applyStepHeading">{t.applyStep3Title}</h3>
                  <p className="muted">{t.comparePlans}</p>
                  <div className="applyPlanGrid">
                    {visiblePlans.map((plan, idx) => {
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
                          <p className="applyPlanSku">
                            <code>{plan.code}</code>
                          </p>
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
                      {t.applyCompanyPhone}
                      <input
                        type="tel"
                        value={onboardForm.companyPhone}
                        onChange={(e) => setOnboardForm((s) => ({ ...s, companyPhone: e.target.value }))}
                        autoComplete="tel"
                        placeholder="+90 …"
                      />
                    </label>
                    <label className="applyLabel">
                      {t.applyAdminPassword}
                      <input
                        type="password"
                        value={onboardForm.adminPassword}
                        onChange={(e) => setOnboardForm((s) => ({ ...s, adminPassword: e.target.value }))}
                        autoComplete="new-password"
                        minLength={8}
                      />
                    </label>
                    <label className="applyLabel">
                      {t.applyAdminPasswordConfirm}
                      <input
                        type="password"
                        value={onboardForm.adminPasswordConfirm}
                        onChange={(e) => setOnboardForm((s) => ({ ...s, adminPasswordConfirm: e.target.value }))}
                        autoComplete="new-password"
                        minLength={8}
                      />
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

              {applyStep === 5 ? (
                <div className="applyStepBlock">
                  <h3 className="applyStepHeading">{t.applyStep5Title}</h3>
                  <p className="muted applyStepDesc">{t.applyPaymentLead}</p>
                  {!purchaseContext ? (
                    <p className="muted">{t.invalidForm}</p>
                  ) : (
                    <>
                      <div className="applyPaymentSummary card" style={{ padding: '16px', marginBottom: 16 }}>
                        <p>
                          <strong>{purchaseContext.companyName}</strong> · <code>{purchaseContext.tenantSlug}</code>
                        </p>
                        <p className="muted">
                          {t.adminEmail}: {purchaseContext.adminEmail}
                        </p>
                        <p>
                          {t.selectedPlan}: <strong>{purchasePlan?.name ?? purchaseContext.planCode}</strong> — ₺
                          {purchasePlan?.priceAmount ?? '—'}{' '}
                          {purchasePlan?.interval === 'YEARLY' ? t.periodYearly : t.periodMonthly}
                        </p>
                      </div>
                      <div className="landingPaymentPanel" style={{ marginTop: 12 }}>
                        <h4 className="landingH3">{t.landingPaymentBank}</h4>
                        <p className="muted">{t.landingBankHint}</p>
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
                      <div className="applyPaymentActions" style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 20 }}>
                        <button
                          type="button"
                          className="primaryBtn"
                          disabled={paymentSubmitting || stripeSubmitting}
                          onClick={async () => {
                            if (!purchaseContext) return;
                            setPaymentSubmitting(true);
                            try {
                              await apiPost('/saas/payments/mock-pay', { subscriptionId: purchaseContext.subscriptionId });
                              sessionStorage.removeItem(APPLY_PURCHASE_STORAGE_KEY);
                              setPurchaseContext(null);
                              setApplyStep(1);
                              setActionMessage(t.paymentCompleteSuccess);
                            } catch {
                              setActionMessage(t.paymentFailed);
                            } finally {
                              setPaymentSubmitting(false);
                            }
                          }}
                        >
                          {paymentSubmitting ? t.loading : t.payMockDemo}
                        </button>
                        <button
                          type="button"
                          className="landingBtn landingBtnOutline"
                          disabled={paymentSubmitting || stripeSubmitting}
                          onClick={async () => {
                            if (!purchaseContext) return;
                            setStripeSubmitting(true);
                            try {
                              sessionStorage.setItem(APPLY_PURCHASE_STORAGE_KEY, JSON.stringify(purchaseContext));
                              const origin = window.location.origin;
                              const res = await apiPost<{
                                ok: boolean;
                                configured?: boolean;
                                url?: string | null;
                                message?: string;
                              }>('/saas/stripe/checkout-session', {
                                planCode: purchaseContext.planCode,
                                subscriptionId: purchaseContext.subscriptionId,
                                successUrl: `${origin}${applyReturnPath}?stripe=1&session_id={CHECKOUT_SESSION_ID}`,
                                cancelUrl: `${origin}${applyReturnPath}?stripe_cancel=1`,
                                customerEmail: purchaseContext.adminEmail,
                              });
                              if (res.ok && res.url) {
                                window.location.assign(res.url);
                              } else {
                                setActionMessage(res.message ?? t.stripeNotConfigured);
                              }
                            } catch {
                              setActionMessage(t.paymentFailed);
                            } finally {
                              setStripeSubmitting(false);
                            }
                          }}
                        >
                          {stripeSubmitting ? t.loading : t.payWithCard}
                        </button>
                      </div>
                    </>
                  )}
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
                  ) : applyStep === 4 ? (
                    <button
                      type="button"
                      className="primaryBtn"
                      disabled={applySubmitting}
                      onClick={async () => {
                        if (purchaseContext) {
                          setApplyStep(5);
                          return;
                        }
                        if (!onboardForm.companyName || !onboardForm.slug || !onboardForm.adminEmail || !onboardForm.adminFullName || !onboardForm.planCode) {
                          setActionMessage(t.invalidForm);
                          return;
                        }
                        if (onboardForm.adminPassword.length < 8) {
                          setActionMessage(t.applyPasswordTooShort);
                          return;
                        }
                        if (onboardForm.adminPassword !== onboardForm.adminPasswordConfirm) {
                          setActionMessage(t.applyPasswordMismatch);
                          return;
                        }
                        if (!termsAccepted) {
                          setActionMessage(t.applyTermsRequired);
                          return;
                        }
                        setApplySubmitting(true);
                        try {
                          const res = await apiPost<{
                            tenant: { slug: string; name: string };
                            subscription: { id: string };
                          }>('/saas/onboard', {
                            companyName: applicationType === 'franchise' ? `${onboardForm.companyName} Franchise` : onboardForm.companyName,
                            slug: onboardForm.slug,
                            vertical: onboardForm.vertical,
                            defaultCurrency: onboardForm.defaultCurrency,
                            companyPhone: onboardForm.companyPhone.trim() || undefined,
                            adminFullName: onboardForm.adminFullName,
                            adminEmail: onboardForm.adminEmail,
                            adminPassword: onboardForm.adminPassword,
                            planCode: onboardForm.planCode,
                            notes: applyNotes.trim() || undefined,
                            applicationKind: applicationType,
                          });
                          const ctx: PurchaseContext = {
                            subscriptionId: res.subscription.id,
                            tenantSlug: res.tenant.slug,
                            planCode: onboardForm.planCode,
                            companyName:
                              applicationType === 'franchise' ? `${onboardForm.companyName} Franchise` : onboardForm.companyName,
                            adminEmail: onboardForm.adminEmail,
                          };
                          setPurchaseContext(ctx);
                          sessionStorage.setItem(APPLY_PURCHASE_STORAGE_KEY, JSON.stringify(ctx));
                          setActionMessage(t.onboardSuccess);
                          setApplyStep(5);
                          setApplyNotes('');
                          setTermsAccepted(false);
                          setOnboardForm((s) => ({
                            ...s,
                            adminPassword: '',
                            adminPasswordConfirm: '',
                          }));
                        } catch {
                          setActionMessage(t.onboardFailed);
                        } finally {
                          setApplySubmitting(false);
                        }
                      }}
                    >
                      {applySubmitting ? t.loading : t.applySubmit}
                    </button>
                  ) : applyStep === 5 ? (
                    <button type="button" className="ghostBtn" onClick={() => goPublic('/')}>
                      {t.backToSite}
                    </button>
                  ) : null}
                </div>
              </div>
            </section>
          </div>
        ) : null}
        {actionMessage ? (
          <div className="publicContent publicToast">
            <div className="appToast appToast--public" role="status" aria-live="polite" aria-label={t.appToastAria}>
              {actionMessage}
            </div>
          </div>
        ) : null}
      </main>
    );
  }

  return (
    <main className={`layout ${!isLoggedIn ? 'layout--gate' : ''}`}>
      <aside className={`sidebar ${sidebarOpen ? 'open' : ''} ${!isLoggedIn ? 'sidebar--gateHidden' : ''}`}>
        <div className="brand">AppointmentOS</div>
        <div className="langSwitch">
          <button className={lang === 'tr' ? 'active' : ''} onClick={() => setLang('tr')}>TR</button>
          <button className={lang === 'en' ? 'active' : ''} onClick={() => setLang('en')}>EN</button>
        </div>
        <nav className="menu">
          {visibleTabs.includes('guests') ? (
            <>
              <p className="menuSection menuSection--reservation">{t.menuSectionReservation}</p>
              <button
                type="button"
                className={`menuPrimaryItem ${tab === 'guests' ? 'active' : ''}`}
                onClick={() => onTabChange('guests')}
              >
                <span className="menuIcon">{iconByTab.guests}</span>
                <span className="menuPrimaryItemLabel">{t.guests}</span>
              </button>
            </>
          ) : null}

          <p className="menuSection">{t.coreSection}</p>
          {visibleTabs.includes('overview') ? <button className={tab === 'overview' ? 'active' : ''} onClick={() => onTabChange('overview')}><span className="menuIcon">{iconByTab.overview}</span>{t.overview}</button> : null}
          {visibleTabs.includes('billing') ? <button className={tab === 'billing' ? 'active' : ''} onClick={() => onTabChange('billing')}><span className="menuIcon">{iconByTab.billing}</span>{t.billing}</button> : null}
          {visibleTabs.includes('operations') ? <button className={tab === 'operations' ? 'active' : ''} onClick={() => onTabChange('operations')}><span className="menuIcon">{iconByTab.operations}</span>{t.operations}</button> : null}

          <p className="menuSection">{t.peopleSection}</p>
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

      <section className={`content ${!isLoggedIn ? 'content--fullWhenGate' : ''}`}>
        <header className="topbar">
          <button type="button" className="menuToggle" onClick={() => setSidebarOpen((v) => !v)} aria-label={t.menu}>
            {t.menu}
          </button>
          <div className="topbarTitle">
            <h1>{t.appTitle}</h1>
            <p>{t.appSubtitle}</p>
          </div>
          {isLoggedIn ? (
            <div className="topbarCrumb muted" title={adminTabDocumentTitle[tab] ?? tab}>
              {adminTabDocumentTitle[tab] ?? tab}
            </div>
          ) : null}
          <div className="topbarActions">
            {isLoggedIn ? (
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
            ) : null}
            <button type="button" className="ghostBtn topbarThemeBtn" onClick={() => setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'))} aria-label={theme === 'dark' ? 'Light theme' : 'Dark theme'}>
              {theme === 'dark' ? <SunMedium size={18} /> : <MoonStar size={18} />}
            </button>
          </div>
        </header>

        {!isLoggedIn ? (
          <section className="card loginCard">
            <h3>{t.loginRequiredTitle}</h3>
            <p className="muted">{t.loginQuickDesc}</p>
            <div className="profileSwitch">
              <button type="button" className={devProfile === 'superAdmin' ? 'active' : ''} onClick={() => setDevProfile('superAdmin')}>{t.superAdminProfile}</button>
              <button type="button" className={devProfile === 'companyManager' ? 'active' : ''} onClick={() => setDevProfile('companyManager')}>{t.companyManagerProfile}</button>
              <button type="button" className={devProfile === 'franchiseManager' ? 'active' : ''} onClick={() => setDevProfile('franchiseManager')}>{t.franchiseManagerProfile}</button>
              <button type="button" className={devProfile === 'employee' ? 'active' : ''} onClick={() => setDevProfile('employee')}>{t.employeeProfile}</button>
              <button type="button" className={devProfile === 'guest' ? 'active' : ''} onClick={() => setDevProfile('guest')}>{t.guestProfile}</button>
            </div>
            <div className="modalActions loginGateActions">
              <button
                type="button"
                className="primaryBtn"
                onClick={() => {
                  setIsLoggedIn(true);
                  if (isDev) {
                    try {
                      window.localStorage.setItem(DEV_ADMIN_LOGIN_KEY, '1');
                    } catch {
                      /* ignore */
                    }
                  }
                }}
              >
                {t.loginAs} {profileLabel[devProfile]}
              </button>
              {isDev ? (
                <button
                  type="button"
                  className="ghostBtn loginDevQuickBtn"
                  onClick={() => {
                    setDevProfile('companyManager');
                    setIsLoggedIn(true);
                    try {
                      window.localStorage.setItem(DEV_ADMIN_LOGIN_KEY, '1');
                    } catch {
                      /* ignore */
                    }
                    navigate('/app/overview');
                  }}
                >
                  {t.devQuickEnter}
                </button>
              ) : null}
            </div>
            {isDev ? <p className="muted loginDevHint">{t.devQuickLoginHint}</p> : null}
            <div className="modalActions">
              <button type="button" className="ghostBtn" onClick={() => navigate('/')}>
                {t.backToSite}
              </button>
            </div>
          </section>
        ) : (
          <section className="sessionBar">
            <div className="sessionBarText">
              <span className="muted">{t.loggedInAs}: <strong>{profileLabel[devProfile]}</strong></span>
              <p className="sessionRoleHint">{roleHint}</p>
            </div>
            <div className="modalActions">
              <button
                type="button"
                className="ghostBtn"
                onClick={() => {
                  setIsLoggedIn(false);
                  if (isDev) {
                    try {
                      window.localStorage.removeItem(DEV_ADMIN_LOGIN_KEY);
                    } catch {
                      /* ignore */
                    }
                  }
                }}
              >
                {t.logout}
              </button>
              <button type="button" className="primaryBtn" onClick={() => onTabChange('overview')}>{t.goOverview}</button>
            </div>
          </section>
        )}

        {actionMessage ? (
          <div className="appToast" role="status" aria-live="polite" aria-label={t.appToastAria}>
            {actionMessage}
          </div>
        ) : null}

        {isLoggedIn ? (
          <>
        {tab === 'overview' ? (
          <>
            {devProfile === 'superAdmin' ? (
              <>
                <p className="muted overviewPageLead">{t.overviewPlatformLead}</p>
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
                              <td>
                                <span className="badge">{tenant.subscriptionStatus}</span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </article>
                  <article className="card">
                    <h3>{t.fastChecks}</h3>
                    <div className="staffRow">
                      <span>{t.apiHealth}</span>
                      <strong>{t.healthy}</strong>
                    </div>
                    <div className="staffRow">
                      <span>{t.dbMigrations}</span>
                      <strong>{t.upToDate}</strong>
                    </div>
                    <div className="staffRow">
                      <span>{t.seedData}</span>
                      <strong>{t.loaded}</strong>
                    </div>
                    <div className="staffRow">
                      <span>{t.tenantIsolation}</span>
                      <strong>{t.active}</strong>
                    </div>
                  </article>
                </section>
              </>
            ) : (
              <>
                <p className="muted overviewPageLead">{t.overviewTenantLead}</p>
                {useRestaurantAreas ? (
                  <div className="overviewVerticalBanner overviewVerticalBanner--restaurant">
                    <Utensils size={22} strokeWidth={1.75} aria-hidden className="overviewVerticalBannerIcon" />
                    <div className="overviewVerticalBannerBody">
                      <strong className="overviewVerticalBannerTitle">{t.overviewVerticalRestaurant}</strong>
                      <p className="muted overviewVerticalBannerDesc">{t.overviewRestaurantHint}</p>
                      <button type="button" className="ghostBtn overviewVerticalCta" onClick={() => onTabChange('operations')}>
                        {t.overviewGoOperations}
                      </button>
                    </div>
                  </div>
                ) : null}
                {overviewTenantLoading ? <p className="muted">{t.loading}</p> : null}
                {tenantOverview ? (
                  <>
                    <section className="kpiGrid">
                      <article className="card">
                        <p className="muted">{t.tenantMetricsBranches}</p>
                        <h2>{tenantOverview.metrics.branches}</h2>
                      </article>
                      <article className="card">
                        <p className="muted">{t.tenantMetricsStaff}</p>
                        <h2>{tenantOverview.metrics.staff}</h2>
                      </article>
                      <article className="card">
                        <p className="muted">{t.tenantMetricsAppts7d}</p>
                        <h2>{tenantOverview.metrics.appointmentsLast7Days}</h2>
                      </article>
                      <article className="card">
                        <p className="muted">{t.tenantMetricsServiceIncome}</p>
                        <h2>
                          ₺
                          {Number(tenantOverview.metrics.serviceIncomeTotal).toLocaleString(lang === 'tr' ? 'tr-TR' : 'en-US', {
                            minimumFractionDigits: 2,
                          })}
                        </h2>
                      </article>
                    </section>
                    <section className="contentGrid">
                      <article className="card wide">
                        <h3>{t.subscriptionDetail}</h3>
                        {tenantOverview.subscription ? (
                          <div className="billingSubSummary">
                            <p>
                              <strong>{tenantOverview.subscription.planName}</strong>{' '}
                              <code>{tenantOverview.subscription.planCode}</code>
                            </p>
                            <p className="muted">
                              {t.status}: <span className="badge">{tenantOverview.subscription.status}</span>
                            </p>
                            {tenantOverview.subscription.trialEndsAt ? (
                              <p className="muted">
                                {t.trialUntil}:{' '}
                                {new Date(tenantOverview.subscription.trialEndsAt).toLocaleString(lang === 'tr' ? 'tr-TR' : 'en-US')}
                              </p>
                            ) : null}
                            {tenantOverview.subscription.nextBillingAt ? (
                              <p className="muted">
                                {t.nextBilling}:{' '}
                                {new Date(tenantOverview.subscription.nextBillingAt).toLocaleString(lang === 'tr' ? 'tr-TR' : 'en-US')}
                              </p>
                            ) : null}
                            <p className="muted">
                              {t.tenant}: {tenantOverview.tenant.name} · {tenantOverview.tenant.slug}
                            </p>
                          </div>
                        ) : (
                          <p className="muted">{t.noSubscriptionForTenant}</p>
                        )}
                      </article>
                      <article className="card">
                        <h3>{t.liveOps}</h3>
                        <p className="muted">{t.tenantMetricsApptsTotal}</p>
                        <h2>{tenantOverview.metrics.appointmentsTotal}</h2>
                        <p className="muted billingHint">{t.billingShortcutHint}</p>
                        <button type="button" className="primaryBtn" onClick={() => onTabChange('billing')}>
                          {t.billing}
                        </button>
                      </article>
                    </section>
                  </>
                ) : !overviewTenantLoading ? (
                  <p className="muted">{t.noRecords}</p>
                ) : null}
                {devProfile === 'guest' ? (
                  <section className="card wide overviewGuestCta">
                    <h3>{t.overviewGuestTitle}</h3>
                    <p className="muted">{t.overviewGuestHint}</p>
                    <button type="button" className="landingBtn landingBtnPrimary" onClick={() => navigate('/reserve')}>
                      {t.navReserve}
                    </button>
                  </section>
                ) : null}
              </>
            )}
          </>
        ) : null}

        {tab === 'billing' ? (
          <>
            {devProfile === 'superAdmin' ? (
              <section className="contentGrid single">
                <p className="muted overviewPageLead">{t.billingPlatformLead}</p>
                <article className="card wide">
                  <h3>{t.pricingPlans}</h3>
                  <p className="muted">{t.billingCatalogHint}</p>
                  <div className="plansGrid">
                    {plans.map((plan) => (
                      <div key={plan.id} className="planCard">
                        <h4>{plan.name}</h4>
                        <p className="price">
                          ₺{plan.priceAmount} / {plan.interval === 'MONTHLY' ? t.periodMonthly : t.periodYearly}
                        </p>
                        <p className="muted">
                          <code>{plan.code}</code>
                        </p>
                        <p className="muted">
                          {t.branches}: {plan.maxBranches} · {t.staff}: {plan.maxStaff}
                        </p>
                        {plan.badgeLabel ? <span className="landingPriceBadge">{plan.badgeLabel}</span> : null}
                      </div>
                    ))}
                  </div>
                </article>
                <article className="card wide">
                  <h3>{t.recentPayments}</h3>
                  <p className="muted">{t.billingPlatformOpsHint}</p>
                  <div className="modalActions billingPlatformActions">
                    <label className="billingSelectLabel">
                      {t.subscription}
                      <select value={selectedSubscriptionId} onChange={(e) => setSelectedSubscriptionId(e.target.value)}>
                        <option value="">{t.subscription}</option>
                        {platformSubscriptionOptions.map((opt) => (
                          <option key={opt.id} value={opt.id}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button
                      type="button"
                      className="primaryBtn"
                      disabled={!selectedSubscriptionId}
                      onClick={async () => {
                        if (!selectedSubscriptionId) return;
                        try {
                          await apiPost('/saas/payments/mock-pay', { subscriptionId: selectedSubscriptionId });
                          const rp = await apiGet<RecentPayment[]>('/platform/recent-payments');
                          setPayments(rp);
                          const ov = await apiGet<Overview>('/platform/overview');
                          setOverview(ov);
                          setActionMessage(t.purchaseSuccess);
                        } catch {
                          setActionMessage(t.purchaseFailed);
                        }
                      }}
                    >
                      {t.payDemoForSubscription}
                    </button>
                    <button
                      type="button"
                      className="ghostBtn"
                      onClick={async () => {
                        try {
                          const rp = await apiGet<RecentPayment[]>('/platform/recent-payments');
                          setPayments(rp);
                          const ts = await apiGet<TenantSummary[]>('/platform/tenants-summary');
                          setTenants(ts);
                          setActionMessage(t.billingListRefreshed);
                        } catch {
                          setActionMessage(t.purchaseFailed);
                        }
                      }}
                    >
                      {t.billingRefreshButton}
                    </button>
                  </div>
                  <div className="tableWrap">
                    <table>
                      <thead>
                        <tr>
                          <th>{t.invoiceRef}</th>
                          <th>{t.tenant}</th>
                          <th>{t.plan}</th>
                          <th>{t.amount}</th>
                          <th>{t.status}</th>
                          <th>{t.paymentDate}</th>
                          <th>{t.provider}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {payments.map((payment) => (
                          <tr key={payment.id}>
                            <td>
                              <code>{paymentInvoiceLabel(payment.id)}</code>
                            </td>
                            <td>{payment.subscription.tenant.name}</td>
                            <td>{payment.subscription.plan.name}</td>
                            <td>₺{payment.amount}</td>
                            <td>
                              <span className="badge">{payment.status}</span>
                            </td>
                            <td>
                              {payment.paidAt
                                ? new Date(payment.paidAt).toLocaleString(lang === 'tr' ? 'tr-TR' : 'en-US')
                                : payment.createdAt
                                  ? new Date(payment.createdAt).toLocaleString(lang === 'tr' ? 'tr-TR' : 'en-US')
                                  : '—'}
                            </td>
                            <td>
                              <span className="muted">{payment.provider ?? '—'}</span>
                              {payment.providerRef ? (
                                <div>
                                  <code className="billingProviderRef">{payment.providerRef}</code>
                                </div>
                              ) : null}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </article>
              </section>
            ) : (
              <section className="contentGrid single billingTenantLayout">
                <p className="muted overviewPageLead">{t.billingTenantLead}</p>
                {billingTabLoading ? <p className="muted">{t.loading}</p> : null}
                {tenantBilling ? (
                  <>
                    <article className="card wide">
                      <h3>{t.billingTenantTitle}</h3>
                      <p className="muted">
                        {tenantBilling.tenant.name} · <code>{tenantBilling.tenant.slug}</code> · {tenantBilling.tenant.vertical}
                      </p>
                      {tenantBilling.subscription ? (
                        <>
                          <div className="billingSubSummary">
                            <h4>{t.subscriptionDetail}</h4>
                            <p>
                              <strong>{tenantBilling.subscription.plan.name}</strong>{' '}
                              <code>{tenantBilling.subscription.plan.code}</code>
                            </p>
                            <p className="muted">
                              {t.status}: <span className="badge">{tenantBilling.subscription.status}</span>
                            </p>
                            <p className="muted">
                              ₺{tenantBilling.subscription.plan.priceAmount} {tenantBilling.subscription.plan.currency} /{' '}
                              {tenantBilling.subscription.plan.interval === 'YEARLY' ? t.periodYearly : t.periodMonthly}
                            </p>
                            {tenantBilling.subscription.trialEndsAt ? (
                              <p className="muted">
                                {t.trialUntil}:{' '}
                                {new Date(tenantBilling.subscription.trialEndsAt).toLocaleString(lang === 'tr' ? 'tr-TR' : 'en-US')}
                              </p>
                            ) : null}
                            <div className="billingRenewalCard">
                              <h4 className="billingRenewalTitle">{t.billingRenewalTitle}</h4>
                              <p className="muted billingRenewalLead">{t.billingRenewalLead}</p>
                              <div className="billingRenewalGrid">
                                <span className="billingRenewalItem">
                                  <span className="muted">{t.billingPlanInterval}</span>
                                  <strong>
                                    {tenantBilling.subscription.plan.interval === 'YEARLY' ? t.periodYearly : t.periodMonthly}
                                  </strong>
                                </span>
                                {tenantBilling.subscription.nextBillingAt ? (
                                  <span className="billingRenewalItem">
                                    <span className="muted">{t.nextBilling}</span>
                                    <strong>
                                      {new Date(tenantBilling.subscription.nextBillingAt).toLocaleDateString(
                                        lang === 'tr' ? 'tr-TR' : 'en-US',
                                        { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' },
                                      )}
                                    </strong>
                                  </span>
                                ) : (
                                  <span className="billingRenewalItem">
                                    <span className="muted">{t.status}</span>
                                    <strong>{tenantBilling.subscription.status}</strong>
                                  </span>
                                )}
                              </div>
                            </div>
                            <div className="planLimitsGrid">
                              <span>
                                {t.branches}: <strong>{tenantBilling.subscription.plan.maxBranches}</strong>
                              </span>
                              <span>
                                {t.staff}: <strong>{tenantBilling.subscription.plan.maxStaff}</strong>
                              </span>
                              <span>
                                {t.applyMaxAppt}: <strong>{tenantBilling.subscription.plan.maxAppointmentsMo}</strong>
                              </span>
                            </div>
                          </div>
                          <div className="modalActions billingTenantPayRow">
                            <button
                              type="button"
                              className="primaryBtn"
                              onClick={async () => {
                                if (!tenantBilling.subscription) return;
                                try {
                                  await apiPost('/saas/payments/mock-pay', { subscriptionId: tenantBilling.subscription.id });
                                  if (!selectedTenant?.slug) return;
                                  const data = await apiGet<TenantBillingPayload>(
                                    `/saas/tenant-billing?tenantSlug=${encodeURIComponent(selectedTenant.slug)}`,
                                  );
                                  setTenantBilling(data);
                                  setActionMessage(t.paymentCompleteSuccess);
                                } catch (err) {
                                  setActionMessage(`${t.paymentFailed}: ${getApiErrorMessage(err)}`);
                                }
                              }}
                            >
                              {t.payMockDemo}
                            </button>
                          </div>
                          <h4 className="billingPaymentsHead">{t.billingHistoryTitle}</h4>
                          <div className="tableWrap">
                            <table>
                              <thead>
                                <tr>
                                  <th>{t.invoiceRef}</th>
                                  <th>{t.amount}</th>
                                  <th>{t.status}</th>
                                  <th>{t.paymentDate}</th>
                                  <th>{t.provider}</th>
                                </tr>
                              </thead>
                              <tbody>
                                {tenantBilling.subscription.payments.length === 0 ? (
                                  <tr>
                                    <td colSpan={5} className="muted">
                                      {t.noPaymentRecords}
                                    </td>
                                  </tr>
                                ) : (
                                  tenantBilling.subscription.payments.map((row) => (
                                    <tr key={row.id}>
                                      <td>
                                        <code>{paymentInvoiceLabel(row.id)}</code>
                                      </td>
                                      <td>
                                        ₺{row.amount} {row.currency}
                                      </td>
                                      <td>
                                        <span className="badge">{row.status}</span>
                                      </td>
                                      <td>
                                        {row.paidAt
                                          ? new Date(row.paidAt).toLocaleString(lang === 'tr' ? 'tr-TR' : 'en-US')
                                          : new Date(row.createdAt).toLocaleString(lang === 'tr' ? 'tr-TR' : 'en-US')}
                                      </td>
                                      <td>
                                        <span className="muted">{row.provider}</span>
                                        {row.providerRef ? (
                                          <div>
                                            <code className="billingProviderRef">{row.providerRef}</code>
                                          </div>
                                        ) : null}
                                      </td>
                                    </tr>
                                  ))
                                )}
                              </tbody>
                            </table>
                          </div>
                        </>
                      ) : (
                        <p className="muted">{t.noSubscriptionForTenant}</p>
                      )}
                    </article>
                    <article className="card">
                      <h3>{t.landingPaymentBank}</h3>
                      <p className="muted">{t.landingBankHint}</p>
                      {tenantBilling.bankAccounts.length === 0 ? (
                        <p className="muted">{t.landingBankEmpty}</p>
                      ) : (
                        <ul className="landingBankList">
                          {tenantBilling.bankAccounts.map((b) => (
                            <li key={b.id} className="landingBankItem">
                              <strong>{b.label}</strong>
                              <span>{b.bankName}</span>
                              <code className="landingIban">{b.iban}</code>
                              <span className="muted">{b.accountHolder}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                      <p className="muted billingHint">{t.billingUpgradeHint}</p>
                      <button type="button" className="ghostBtn" onClick={() => window.open('/#pricing', '_blank')}>
                        {t.openPublicPlans}
                      </button>
                    </article>
                  </>
                ) : !billingTabLoading ? (
                  <p className="muted">{t.noRecords}</p>
                ) : null}
              </section>
            )}
          </>
        ) : null}

        {tab === 'guests' ? (
          <section className="contentGrid single">
            <article className="card wide reserveCard reserveFlow reserveFlowAdmin reserveFlow--panel">
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

              <div className="reserveStickyBar reserveStickyBar--compact">
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
              </div>

              <p className="reserveUxTip muted">{t.reserveUxTip}</p>
              <p className="reserveSlotsAutoHint">{t.reserveSlotsAuto}</p>

              <div id="guest-step-1" className="reserveBlock">
                <h4 className="reserveBlockTitle">
                  <span className="reserveBlockNum">1</span>
                  {t.selectBranch}
                </h4>
                <div className="reserveBranchGrid">
                  {reserveBranches.length === 0 ? (
                    <p className="muted reserveBranchEmpty">{t.reserveNoBranches}</p>
                  ) : (
                    reserveBranches.map((b) => (
                      <button
                        key={b.id}
                        type="button"
                        className={`reserveBranchCard ${guestForm.branchId === b.id ? 'isSelected' : ''}`}
                        onClick={() => setGuestForm((s) => ({ ...s, branchId: b.id, staffUserId: '', serviceId: '' }))}
                      >
                        <Building2 size={22} aria-hidden />
                        <span className="reserveBranchName">{b.name}</span>
                        <span className="reserveBranchCode">
                          {b.code}
                          {b.code?.toUpperCase() === 'HQ' ? <span className="reserveBranchHqBadge">{t.mainBranchBadge}</span> : null}
                        </span>
                      </button>
                    ))
                  )}
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
                        {useRestaurantAreas && pricingHint?.hasRule ? (
                          <>
                            {s.durationMin}′ ·{' '}
                            <span className="reserveStrike">₺{s.priceAmount}</span>{' '}
                            <strong>₺{applyPriceHint(Number(s.priceAmount))}</strong> {s.currency}
                            {pricingHint.label ? (
                              <span className="reservePricingBadge" title={pricingHint.note ?? ''}>
                                {pricingHint.label}
                              </span>
                            ) : null}
                          </>
                        ) : (
                          <>
                            {s.durationMin}′ · ₺{s.priceAmount} {s.currency}
                          </>
                        )}
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
                <p className="reserveShiftHint">{useRestaurantAreas ? t.restaurantAreaShiftHint : t.shiftBreak}</p>
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

                <p className="reserveStaffPickTitle">{useRestaurantAreas ? t.chooseRestaurantArea : t.chooseStaff}</p>
                <div className="reserveStaffChips" role="group" aria-label={useRestaurantAreas ? t.chooseRestaurantArea : t.chooseStaff}>
                  <button
                    type="button"
                    className={`reserveStaffChip ${guestForm.staffUserId === '' ? 'isSelected' : ''}`}
                    onClick={() => setGuestForm((s) => ({ ...s, staffUserId: '' }))}
                  >
                    {useRestaurantAreas ? t.anyRestaurantArea : t.anyStaff}
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

                <details className="reserveStaffDetails">
                  <summary className="reserveStaffDetailsSummary">
                    {useRestaurantAreas ? t.restaurantAreaDetailsToggle : t.reserveStaffCalendarToggle}
                  </summary>
                  <h5 className="reserveSubheading">{useRestaurantAreas ? t.restaurantAreaCalendar : t.staffCalendar}</h5>
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
                </details>

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
                  <p className="reservePickSlotHint">{t.reservePickSlotHint}</p>
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
                            className={`reserveSlotChip ${isSlotSelected(slot) ? 'isSelected' : ''}`}
                            onClick={() => pickPublicSlot(slot)}
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
                            className={`reserveSlotChip ${isSlotSelected(slot) ? 'isSelected' : ''}`}
                            onClick={() => pickPublicSlot(slot)}
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
                            className={`reserveSlotChip ${isSlotSelected(slot) ? 'isSelected' : ''}`}
                            onClick={() => pickPublicSlot(slot)}
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

              <div id="booking-contact" className="reserveBlock reserveRequestBlock">
                <h4 className="reserveBlockTitle">
                  <span className="reserveBlockNum">4</span>
                  {t.reserveRequestTitle}
                </h4>
                <div className="reserveRequestSummary" aria-live="polite">
                  <p className="reserveRequestSummaryTitle">{t.reserveSummaryTitle}</p>
                  <ul className="reserveRequestSummaryList">
                    <li>
                      <span className="reserveRequestSummaryKey">{t.selectTenant}</span>
                      <span className="reserveRequestSummaryVal">{selectedTenant?.name ?? '—'}</span>
                    </li>
                    <li>
                      <span className="reserveRequestSummaryKey">{t.selectBranch}</span>
                      <span className="reserveRequestSummaryVal">{publicReserveSummary.branchName || '—'}</span>
                    </li>
                    <li>
                      <span className="reserveRequestSummaryKey">{t.selectService}</span>
                      <span className="reserveRequestSummaryVal">
                        {publicReserveSummary.serviceName ? `${publicReserveSummary.serviceName} (${publicReserveSummary.serviceMeta})` : '—'}
                      </span>
                    </li>
                    <li>
                      <span className="reserveRequestSummaryKey">{t.selectDate}</span>
                      <span className="reserveRequestSummaryVal">{publicReserveSummary.dateFmt || '—'}</span>
                    </li>
                    <li>
                      <span className="reserveRequestSummaryKey">{t.reservePickSlot}</span>
                      <span className="reserveRequestSummaryVal">
                        {pendingSlot ? `${publicReserveSummary.timeFmt} · ${publicReserveSummary.staffName}` : '—'}
                      </span>
                    </li>
                  </ul>
                </div>

                <p className="reserveContactSectionLabel">{t.reserveContactTitle}</p>
                <div className="formGrid reserveContactGrid">
                  <label className="reserveLabel">
                    {t.name}
                    <input value={guestForm.customerName} onChange={(e) => setGuestForm((s) => ({ ...s, customerName: e.target.value }))} autoComplete="name" />
                  </label>
                  <label className="reserveLabel">
                    {t.phone}
                    <input
                      type="tel"
                      inputMode="tel"
                      value={guestForm.customerPhone}
                      onChange={(e) => setGuestForm((s) => ({ ...s, customerPhone: e.target.value }))}
                      autoComplete="tel"
                    />
                  </label>
                  <label className="reserveLabel reserveSpan2">
                    {t.email}
                    <input type="email" value={guestForm.customerEmail} onChange={(e) => setGuestForm((s) => ({ ...s, customerEmail: e.target.value }))} autoComplete="email" />
                  </label>
                </div>

                <button
                  type="button"
                  className="reserveSubmitBtn"
                  disabled={
                    reservationSubmitting ||
                    !pendingSlot ||
                    !guestForm.customerName.trim() ||
                    !guestForm.customerPhone.trim()
                  }
                  onClick={() => void submitReservationRequest()}
                >
                  {reservationSubmitting ? <Loader2 size={20} className="reserveSpin" aria-hidden /> : <Send size={20} aria-hidden />}
                  {reservationSubmitting ? t.reserveSending : t.reserveSubmit}
                </button>
                {!pendingSlot ? <p className="reserveSubmitHint muted">{t.reserveSelectSlotFirst}</p> : null}

                <details className="reserveNotifyDetails">
                  <summary>{t.reserveNotifyToggle}</summary>
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
                </details>
              </div>
            </article>
          </section>
        ) : null}

        {tab === 'employees' ? (
          <section className="contentGrid single">
            <article className="card wide">
              <div className="cardHead">
                <h3>{t.employeeScreen}</h3>
                <button className="primaryBtn" type="button" onClick={() => setUserModalMode('employee')}>
                  {t.addEmployee}
                </button>
              </div>
              <div className="tableWrap">
                <table>
                  <thead>
                    <tr>
                      <th>{t.name}</th>
                      <th>{t.email}</th>
                      <th>{t.role}</th>
                      <th>{t.branch}</th>
                      <th>{selectedTenantId && isDemoTenantId(selectedTenantId) ? t.load : t.specialty}</th>
                      {selectedTenantId && !isDemoTenantId(selectedTenantId) ? <th>{t.action}</th> : null}
                    </tr>
                  </thead>
                  <tbody>
                    {selectedTenantId && isDemoTenantId(selectedTenantId)
                      ? employeeRows.map((row) => (
                          <tr key={row.fullName}>
                            <td>{row.fullName}</td>
                            <td>—</td>
                            <td>{row.role}</td>
                            <td>{row.branch}</td>
                            <td>{row.load}</td>
                          </tr>
                        ))
                      : tenantUsers
                          .filter((u) => u.isStaff)
                          .map((u) => (
                            <tr key={u.id}>
                              <td>{u.fullName}</td>
                              <td>{u.email}</td>
                              <td>{u.userRoles.map((r) => r.role.code).join(', ') || 'STAFF'}</td>
                              <td>{u.branch?.name ?? '—'}</td>
                              <td>{u.staffProfile?.specialty ?? '—'}</td>
                              <td>
                                <button
                                  className="ghostBtn"
                                  type="button"
                                  onClick={async () => {
                                    if (!window.confirm(t.confirmDeleteUser)) return;
                                    try {
                                      await apiDelete(`/tenants/users/${u.id}`, { 'x-tenant-id': selectedTenantId });
                                      setTenantUsers((prev) => prev.filter((x) => x.id !== u.id));
                                      setActionMessage(t.userDeleted);
                                    } catch {
                                      setActionMessage(t.userDeleteFailed);
                                    }
                                  }}
                                >
                                  {t.delete}
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

        {tab === 'managers' ? (
          <section className="contentGrid single">
            <article className="card wide">
              <div className="cardHead">
                <h3>{t.managerScreen}</h3>
                <button className="primaryBtn" type="button" onClick={() => setUserModalMode('manager')}>
                  {t.addManager}
                </button>
              </div>
              <div className="tableWrap">
                <table>
                  <thead>
                    <tr>
                      <th>{t.name}</th>
                      <th>{t.email}</th>
                      <th>{t.role}</th>
                      <th>{t.branch}</th>
                      {selectedTenantId && isDemoTenantId(selectedTenantId) ? <th>{t.team}</th> : null}
                      {selectedTenantId && !isDemoTenantId(selectedTenantId) ? <th>{t.action}</th> : null}
                    </tr>
                  </thead>
                  <tbody>
                    {selectedTenantId && isDemoTenantId(selectedTenantId)
                      ? managerRows.map((row) => (
                          <tr key={row.fullName}>
                            <td>{row.fullName}</td>
                            <td>—</td>
                            <td>{row.role}</td>
                            <td>{row.branch}</td>
                            <td>{row.teamSize}</td>
                          </tr>
                        ))
                      : tenantUsers
                          .filter((u) => !u.isStaff)
                          .map((u) => (
                            <tr key={u.id}>
                              <td>{u.fullName}</td>
                              <td>{u.email}</td>
                              <td>{u.userRoles.map((r) => r.role.code).join(', ') || 'ADMIN'}</td>
                              <td>{u.branch?.name ?? '—'}</td>
                              <td>
                                <button
                                  className="ghostBtn"
                                  type="button"
                                  onClick={async () => {
                                    if (!window.confirm(t.confirmDeleteUser)) return;
                                    try {
                                      await apiDelete(`/tenants/users/${u.id}`, { 'x-tenant-id': selectedTenantId });
                                      setTenantUsers((prev) => prev.filter((x) => x.id !== u.id));
                                      setActionMessage(t.userDeleted);
                                    } catch {
                                      setActionMessage(t.userDeleteFailed);
                                    }
                                  }}
                                >
                                  {t.delete}
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

        {tab === 'companyRoles' ? <section className="contentGrid single"><article className="card wide"><h3>{t.companyRoles}</h3><div className="formGrid"><label>{t.roleCode}<input value={roleForm.code} onChange={(e) => setRoleForm((s) => ({ ...s, code: e.target.value }))} placeholder="CMP_MANAGER" /></label><label>{t.roleName}<input value={roleForm.name} onChange={(e) => setRoleForm((s) => ({ ...s, name: e.target.value }))} /></label><label>{t.roleDesc}<input value={roleForm.description} onChange={(e) => setRoleForm((s) => ({ ...s, description: e.target.value }))} /></label></div><div className="modalActions"><button className="primaryBtn" onClick={async () => { if (!selectedTenantId || !roleForm.code || !roleForm.name) return; try { await apiPost('/tenants/roles', roleForm, { 'x-tenant-id': selectedTenantId }); const roleRows = await apiGetWithHeaders<RoleRow[]>('/tenants/roles', { 'x-tenant-id': selectedTenantId }); setRoles(roleRows); setRoleForm({ code: '', name: '', description: '' }); } catch { setActionMessage(t.serviceCreateFailed); } }}>{t.addRole}</button></div><div className="tableWrap"><table><thead><tr><th>{t.roleCode}</th><th>{t.roleName}</th><th>{t.description}</th></tr></thead><tbody>{roles.filter((r) => r.code.startsWith('CMP_')).map((row) => <tr key={row.id}><td>{row.code}</td><td>{row.name}</td><td>{row.description}</td></tr>)}</tbody></table></div></article></section> : null}
        {tab === 'franchiseRoles' ? <section className="contentGrid single"><article className="card wide"><h3>{t.franchiseRoles}</h3><div className="tableWrap"><table><thead><tr><th>{t.roleCode}</th><th>{t.roleName}</th><th>{t.description}</th></tr></thead><tbody>{roles.filter((r) => r.code.startsWith('FRA_')).map((row) => <tr key={row.id}><td>{row.code}</td><td>{row.name}</td><td>{row.description}</td></tr>)}{roles.filter((r) => r.code.startsWith('FRA_')).length === 0 ? <tr><td colSpan={3} className="muted">{t.noRecords}</td></tr> : null}</tbody></table></div></article></section> : null}
        {tab === 'subRoles' ? <section className="contentGrid single"><article className="card wide"><h3>{t.subRoles}</h3><div className="tableWrap"><table><thead><tr><th>{t.roleCode}</th><th>{t.roleName}</th><th>{t.description}</th></tr></thead><tbody>{roles.filter((r) => r.code.startsWith('SUB_')).map((row) => <tr key={row.id}><td>{row.code}</td><td>{row.name}</td><td>{row.description}</td></tr>)}{roles.filter((r) => r.code.startsWith('SUB_')).length === 0 ? <tr><td colSpan={3} className="muted">{t.noRecords}</td></tr> : null}</tbody></table></div></article></section> : null}

        {tab === 'services' ? (
          <section className="contentGrid single">
            <article className="card wide">
              <h3>{t.servicesCatalog}</h3>
              <div className="formGrid">
                <label>
                  {t.branch}
                  <select
                    value={serviceForm.branchId}
                    onChange={(e) => setServiceForm((s) => ({ ...s, branchId: e.target.value }))}
                  >
                    {branches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  {t.category}
                  <input
                    value={serviceForm.categoryName}
                    onChange={(e) => setServiceForm((s) => ({ ...s, categoryName: e.target.value }))}
                  />
                </label>
                <label>
                  {t.name}
                  <input value={serviceForm.name} onChange={(e) => setServiceForm((s) => ({ ...s, name: e.target.value }))} />
                </label>
                <label>
                  {t.duration}
                  <input
                    type="number"
                    value={serviceForm.durationMin}
                    onChange={(e) => setServiceForm((s) => ({ ...s, durationMin: Number(e.target.value) }))}
                  />
                </label>
                <label>
                  {t.amount}
                  <input
                    type="number"
                    value={serviceForm.priceAmount}
                    onChange={(e) => setServiceForm((s) => ({ ...s, priceAmount: Number(e.target.value) }))}
                  />
                </label>
                <label>
                  {t.currency}
                  <input value={serviceForm.currency} onChange={(e) => setServiceForm((s) => ({ ...s, currency: e.target.value }))} />
                </label>
              </div>
              <div className="modalActions">
                <button
                  className="ghostBtn"
                  type="button"
                  onClick={async () => {
                    try {
                      await apiPost('/tenants/settings/currency', { currency: currencyForm }, { 'x-tenant-id': selectedTenantId });
                      setActionMessage(t.currencyUpdated);
                    } catch (err) {
                      setActionMessage(`${t.currencyUpdateFailed}: ${getApiErrorMessage(err)}`);
                    }
                  }}
                >
                  {t.save} {t.currency}
                </button>
                <input value={currencyForm} onChange={(e) => setCurrencyForm(e.target.value)} />
                <button
                  className="primaryBtn"
                  type="button"
                  disabled={!selectedTenantId || isDemoTenantId(selectedTenantId)}
                  onClick={async () => {
                    if (!selectedTenantId || isDemoTenantId(selectedTenantId)) return;
                    try {
                      await apiPost('/services', serviceForm, { 'x-tenant-id': selectedTenantId });
                      const rows = await apiGetWithHeaders<ServiceLite[]>(
                        `/services?branchId=${serviceForm.branchId}`,
                        { 'x-tenant-id': selectedTenantId },
                      );
                      setBranchServices(rows);
                      setActionMessage(t.serviceCreated);
                    } catch (err) {
                      setActionMessage(`${t.serviceCreateFailed}: ${getApiErrorMessage(err)}`);
                    }
                  }}
                >
                  {t.save}
                </button>
              </div>
              <div className="tableWrap">
                <table>
                  <thead>
                    <tr>
                      <th>{t.name}</th>
                      <th>{t.category}</th>
                      <th>{t.duration}</th>
                      <th>{t.amount}</th>
                      <th>{t.action}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {branchServices.map((row) => (
                      <tr key={row.id}>
                        <td>{row.name}</td>
                        <td>{row.category?.name ?? '-'}</td>
                        <td>{row.durationMin}</td>
                        <td>
                          {row.priceAmount} {row.currency}
                        </td>
                        <td>
                          <div className="actionBtns">
                            <button
                              className="ghostBtn"
                              type="button"
                              disabled={isDemoTenantId(selectedTenantId)}
                              onClick={() =>
                                setServiceEditDraft({
                                  id: row.id,
                                  name: row.name,
                                  durationMin: row.durationMin,
                                  priceAmount: Number(row.priceAmount),
                                })
                              }
                            >
                              {t.edit}
                            </button>
                            <button
                              className="ghostBtn"
                              type="button"
                              disabled={isDemoTenantId(selectedTenantId)}
                              onClick={async () => {
                                if (!window.confirm(t.confirmDeleteService)) return;
                                try {
                                  await apiDelete(`/services/${row.id}`, { 'x-tenant-id': selectedTenantId });
                                  const rows = await apiGetWithHeaders<ServiceLite[]>(
                                    `/services?branchId=${serviceForm.branchId}`,
                                    { 'x-tenant-id': selectedTenantId },
                                  );
                                  setBranchServices(rows);
                                  setActionMessage(t.serviceDeleted);
                                } catch (err) {
                                  setActionMessage(`${t.serviceDeleteFailed}: ${getApiErrorMessage(err)}`);
                                }
                              }}
                            >
                              {t.delete}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </article>
          </section>
        ) : null}

        {tab === 'assignment' ? (
          <section className="contentGrid single">
            <article className="card wide">
              <h3>{t.reservationAssign}</h3>
              <div className="modalActions">
                <label>
                  {t.reservationStatus}
                  <select
                    value={reservationStatusFilter}
                    onChange={(e) => setReservationStatusFilter(e.target.value as ReservationStatusFilter)}
                  >
                    <option value="ALL">{t.all}</option>
                    <option value="PENDING">PENDING</option>
                    <option value="CONFIRMED">CONFIRMED</option>
                    <option value="IN_PROGRESS">IN_PROGRESS</option>
                    <option value="COMPLETED">COMPLETED</option>
                    <option value="CANCELLED">CANCELLED</option>
                  </select>
                </label>
              </div>
              <div className="tableWrap">
                <table>
                  <thead>
                    <tr>
                      <th>{t.name}</th>
                      <th>{t.reservation}</th>
                      <th>{useRestaurantAreas ? t.chooseRestaurantArea : t.employees}</th>
                      <th>{t.branch}</th>
                      <th>{t.status}</th>
                      <th>{t.action}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reservations.map((row) => (
                      <tr key={row.id}>
                        <td>{row.customer.fullName}</td>
                        <td>
                          {row.service.name} / {new Date(row.startsAt).toLocaleString()}
                        </td>
                        <td>{formatReservationStaffOrArea(row)}</td>
                        <td>{row.branch.name}</td>
                        <td>
                          <span className="badge">{row.status}</span>
                        </td>
                        <td>
                          <div className="actionBtns">
                            <button
                              className="ghostBtn"
                              type="button"
                              disabled={!canApprove(row.status)}
                              onClick={async () => {
                                try {
                                  await apiPost(
                                    `/employee/reservations/${row.id}/approve`,
                                    { changedByEmail: actorEmail },
                                    { 'x-tenant-id': selectedTenantId },
                                  );
                                  const reservationQuery =
                                    reservationStatusFilter === 'ALL' ? '' : `?status=${reservationStatusFilter}`;
                                  const reservationRows = await apiGetWithHeaders<ReservationRow[]>(
                                    `/employee/reservations${reservationQuery}`,
                                    { 'x-tenant-id': selectedTenantId },
                                  );
                                  setReservations(reservationRows);
                                  setActionMessage(`${t.approved}: ${row.id}`);
                                } catch (err) {
                                  setActionMessage(`${t.approveFailed}: ${getApiErrorMessage(err)}`);
                                }
                              }}
                            >
                              {t.approve}
                            </button>
                            <button
                              className="ghostBtn"
                              type="button"
                              disabled={!canStart(row.status)}
                              onClick={async () => {
                                try {
                                  await apiPost(
                                    `/employee/reservations/${row.id}/start`,
                                    { changedByEmail: actorEmail },
                                    { 'x-tenant-id': selectedTenantId },
                                  );
                                  const reservationQuery =
                                    reservationStatusFilter === 'ALL' ? '' : `?status=${reservationStatusFilter}`;
                                  const reservationRows = await apiGetWithHeaders<ReservationRow[]>(
                                    `/employee/reservations${reservationQuery}`,
                                    { 'x-tenant-id': selectedTenantId },
                                  );
                                  setReservations(reservationRows);
                                  setActionMessage(`${t.started}: ${row.id}`);
                                } catch (err) {
                                  setActionMessage(`${t.startFailed}: ${getApiErrorMessage(err)}`);
                                }
                              }}
                            >
                              {t.start}
                            </button>
                            <button
                              className="primaryBtn"
                              type="button"
                              disabled={!canComplete(row.status)}
                              onClick={async () => {
                                try {
                                  await apiPost(
                                    `/employee/reservations/${row.id}/complete`,
                                    { changedByEmail: actorEmail },
                                    { 'x-tenant-id': selectedTenantId },
                                  );
                                  const reservationQuery =
                                    reservationStatusFilter === 'ALL' ? '' : `?status=${reservationStatusFilter}`;
                                  const ledgerQuery = ledgerTypeFilter === 'ALL' ? '' : `?type=${ledgerTypeFilter}`;
                                  const [reservationRows, ledgerRows] = await Promise.all([
                                    apiGetWithHeaders<ReservationRow[]>(`/employee/reservations${reservationQuery}`, {
                                      'x-tenant-id': selectedTenantId,
                                    }),
                                    apiGetWithHeaders<LedgerEntry[]>(`/accounting/ledger${ledgerQuery}`, {
                                      'x-tenant-id': selectedTenantId,
                                    }),
                                  ]);
                                  setReservations(reservationRows);
                                  setLedger(ledgerRows);
                                  setActionMessage(`${t.completedAndAccounted}: ${row.id}`);
                                } catch (err) {
                                  setActionMessage(`${t.completeFailed}: ${getApiErrorMessage(err)}`);
                                }
                              }}
                            >
                              {t.complete}
                            </button>
                            <button
                              className="ghostBtn"
                              type="button"
                              disabled={!canCancelReservation(row.status)}
                              onClick={async () => {
                                if (!window.confirm(t.confirmCancelReservation)) return;
                                try {
                                  await apiPost(
                                    `/employee/reservations/${row.id}/cancel`,
                                    { changedByEmail: actorEmail },
                                    { 'x-tenant-id': selectedTenantId },
                                  );
                                  const reservationQuery =
                                    reservationStatusFilter === 'ALL' ? '' : `?status=${reservationStatusFilter}`;
                                  const reservationRows = await apiGetWithHeaders<ReservationRow[]>(
                                    `/employee/reservations${reservationQuery}`,
                                    { 'x-tenant-id': selectedTenantId },
                                  );
                                  setReservations(reservationRows);
                                  setActionMessage(t.reservationCancelled);
                                } catch (err) {
                                  setActionMessage(`${t.cancelFailed}: ${getApiErrorMessage(err)}`);
                                }
                              }}
                            >
                              {t.cancelReservation}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {reservations.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="muted">
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

        {tab === 'operations' ? (
          <section className="contentGrid single">
            <article className="card wide">
              <h3>{t.operationsBranches}</h3>
              {selectedTenantId && isDemoTenantId(selectedTenantId) ? (
                <p className="muted">{t.demoReadOnly}</p>
              ) : (
                <>
                  <div className="formGrid">
                    <label>
                      {t.name}
                      <input
                        value={branchCrudForm.name}
                        onChange={(e) => setBranchCrudForm((s) => ({ ...s, name: e.target.value }))}
                      />
                    </label>
                    <label>
                      {t.branchCode}
                      <input
                        value={branchCrudForm.code}
                        onChange={(e) => setBranchCrudForm((s) => ({ ...s, code: e.target.value }))}
                      />
                    </label>
                    <label>
                      {t.city}
                      <input
                        value={branchCrudForm.city}
                        onChange={(e) => setBranchCrudForm((s) => ({ ...s, city: e.target.value }))}
                      />
                    </label>
                  </div>
                  <div className="modalActions">
                    <button
                      className="primaryBtn"
                      type="button"
                      disabled={!selectedTenantId || !branchCrudForm.name || !branchCrudForm.code}
                      onClick={async () => {
                        if (!selectedTenantId) return;
                        try {
                          await apiPost(
                            '/branches',
                            { name: branchCrudForm.name.trim(), code: branchCrudForm.code.trim().toUpperCase(), city: branchCrudForm.city || undefined },
                            { 'x-tenant-id': selectedTenantId },
                          );
                          await refreshBranches();
                          setBranchCrudForm({ name: '', code: '', city: '' });
                          setActionMessage(t.branchCreated);
                        } catch (err) {
                          setActionMessage(`${t.branchCreateFailed}: ${getApiErrorMessage(err)}`);
                        }
                      }}
                    >
                      {t.addBranch}
                    </button>
                  </div>
                </>
              )}
              <div className="tableWrap">
                <table>
                  <thead>
                    <tr>
                      <th>{t.name}</th>
                      <th>{t.branchCode}</th>
                      <th>{t.action}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {branches.map((b) => (
                      <tr key={b.id}>
                        <td>{b.name}</td>
                        <td>
                          <code>{b.code}</code>
                        </td>
                        <td>
                          <button
                            className="ghostBtn"
                            type="button"
                            disabled={!selectedTenantId || isDemoTenantId(selectedTenantId)}
                            onClick={async () => {
                              if (!window.confirm(t.confirmDeleteBranch)) return;
                              try {
                                await apiDelete(`/branches/${b.id}`, { 'x-tenant-id': selectedTenantId });
                                await refreshBranches();
                                if (opsBranchId === b.id) {
                                  setOpsBranchId('');
                                }
                                setActionMessage(t.branchDeleted);
                              } catch (err) {
                                setActionMessage(`${t.branchDeleteFailed}: ${getApiErrorMessage(err)}`);
                              }
                            }}
                          >
                            {t.delete}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </article>

            {useRestaurantAreas ? (
              <article className="card wide opsRestaurantCard">
                <div className="cardHead">
                  <h3>
                    <Utensils size={20} strokeWidth={1.85} aria-hidden className="opsRestaurantTitleIcon" />
                    {t.restaurantOpsPricingTitle}
                  </h3>
                </div>
                <p className="muted">{t.restaurantOpsPricingLead}</p>
                <p className="opsRestaurantFreePaid">{t.restaurantOpsFreeVsPaid}</p>
                <p className="muted opsRestaurantAreaFlow">{t.restaurantAreaOpsHint}</p>
                {selectedTenantId && isDemoTenantId(selectedTenantId) ? (
                  <>
                    <div className="demoPricingBanner">
                      <p className="muted">{t.restaurantPricingDemoHint}</p>
                      <p>
                        <strong>{t.demoSpecialDateLabel}:</strong>{' '}
                        <code className="demoPricingDateCode">{getDemoSpecialPricingDateYmd()}</code>
                      </p>
                    </div>
                    <div className="restaurantPricingRulesSection">
                      <h4 className="restaurantPricingRulesTitle">{t.restaurantPricingRulesHead}</h4>
                      <p className="muted">{t.restaurantPricingRulesDemoOnly}</p>
                      <div className="tableWrap">
                        <table>
                          <thead>
                            <tr>
                              <th>{t.restaurantPricingColDate}</th>
                              <th>{t.restaurantPricingColLabel}</th>
                              <th>{t.restaurantPricingColExtra}</th>
                              <th>{t.restaurantPricingColActive}</th>
                            </tr>
                          </thead>
                          <tbody>
                            <tr>
                              <td>
                                <code>{getDemoSpecialPricingDateYmd()}</code>
                              </td>
                              <td>{lang === 'tr' ? 'Önemli gün (demo)' : 'Special day (demo)'}</td>
                              <td>%15</td>
                              <td>
                                <span className="badge">{t.active}</span>
                              </td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="formGrid">
                      <label>
                        {t.branch}
                        <select
                          value={restaurantPricingForm.branchId}
                          onChange={(e) => setRestaurantPricingForm((s) => ({ ...s, branchId: e.target.value }))}
                        >
                          {branches.map((b) => (
                            <option key={b.id} value={b.id}>
                              {b.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        {t.restaurantPricingDate}
                        <input
                          type="date"
                          value={restaurantPricingForm.dateYmd}
                          onChange={(e) => setRestaurantPricingForm((s) => ({ ...s, dateYmd: e.target.value }))}
                        />
                      </label>
                      <label>
                        {t.restaurantPricingSurcharge}
                        <input
                          type="number"
                          min={0}
                          step={0.5}
                          value={restaurantPricingForm.surchargePercent}
                          onChange={(e) => setRestaurantPricingForm((s) => ({ ...s, surchargePercent: e.target.value }))}
                        />
                      </label>
                      <label>
                        {t.restaurantPricingExtra}
                        <input
                          type="number"
                          min={0}
                          step={1}
                          value={restaurantPricingForm.extraAmount}
                          onChange={(e) => setRestaurantPricingForm((s) => ({ ...s, extraAmount: e.target.value }))}
                        />
                      </label>
                      <label>
                        {t.restaurantPricingLabel}
                        <input
                          value={restaurantPricingForm.label}
                          onChange={(e) => setRestaurantPricingForm((s) => ({ ...s, label: e.target.value }))}
                        />
                      </label>
                      <label className="reserveSpan2">
                        {t.restaurantPricingNote}
                        <input
                          value={restaurantPricingForm.note}
                          onChange={(e) => setRestaurantPricingForm((s) => ({ ...s, note: e.target.value }))}
                        />
                      </label>
                    </div>
                    <div className="modalActions">
                      <button
                        type="button"
                        className="primaryBtn"
                        disabled={
                          !selectedTenantId ||
                          !restaurantPricingForm.branchId ||
                          !restaurantPricingForm.dateYmd ||
                          isDemoTenantId(selectedTenantId)
                        }
                        onClick={async () => {
                          if (!selectedTenantId || !restaurantPricingForm.branchId || !restaurantPricingForm.dateYmd) return;
                          try {
                            await apiPost(
                              '/employee/branch-pricing-day',
                              {
                                branchId: restaurantPricingForm.branchId,
                                dateYmd: restaurantPricingForm.dateYmd,
                                label: restaurantPricingForm.label || undefined,
                                surchargePercent:
                                  restaurantPricingForm.surchargePercent === ''
                                    ? null
                                    : Number(restaurantPricingForm.surchargePercent),
                                extraAmount:
                                  restaurantPricingForm.extraAmount === '' ? null : Number(restaurantPricingForm.extraAmount),
                                note: restaurantPricingForm.note || null,
                              },
                              { 'x-tenant-id': selectedTenantId },
                            );
                            setActionMessage(t.restaurantPricingSaved);
                            void reloadBranchPricingDays();
                          } catch (err) {
                            setActionMessage(`${t.restaurantPricingFailed}: ${getApiErrorMessage(err)}`);
                          }
                        }}
                      >
                        {t.restaurantPricingSave}
                      </button>
                    </div>
                    <div className="restaurantPricingRulesSection">
                      <div className="restaurantPricingRulesToolbar">
                        <h4 className="restaurantPricingRulesTitle">{t.restaurantPricingRulesHead}</h4>
                        <button
                          type="button"
                          className="ghostBtn"
                          onClick={() => void reloadBranchPricingDays()}
                          disabled={branchPricingDaysLoading || !restaurantPricingForm.branchId}
                        >
                          <RefreshCw size={16} className={branchPricingDaysLoading ? 'reserveSpin' : ''} aria-hidden />
                          {t.restaurantPricingRulesRefresh}
                        </button>
                      </div>
                      {branchPricingDaysLoading ? <p className="muted">{t.loading}</p> : null}
                      {!branchPricingDaysLoading && branchPricingDays.length === 0 ? (
                        <p className="muted">{t.restaurantPricingRulesEmpty}</p>
                      ) : null}
                      {!branchPricingDaysLoading && branchPricingDays.length > 0 ? (
                        <div className="tableWrap">
                          <table>
                            <thead>
                              <tr>
                                <th>{t.restaurantPricingColDate}</th>
                                <th>{t.restaurantPricingColLabel}</th>
                                <th>{t.restaurantPricingColExtra}</th>
                                <th>{t.restaurantPricingColActive}</th>
                              </tr>
                            </thead>
                            <tbody>
                              {branchPricingDays.map((row) => (
                                <tr key={row.id}>
                                  <td>
                                    <code>{row.date}</code>
                                  </td>
                                  <td>{row.label ?? '—'}</td>
                                  <td>
                                    {[
                                      row.surchargePercent != null ? `%${row.surchargePercent}` : null,
                                      row.extraAmount != null ? `₺${row.extraAmount}` : null,
                                    ]
                                      .filter(Boolean)
                                      .join(' + ') || '—'}
                                  </td>
                                  <td>
                                    <span className="badge">{row.isActive ? t.yes : t.no}</span>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : null}
                    </div>
                  </>
                )}
              </article>
            ) : null}

            <article className="card wide">
              <h3>{t.operationsSchedules}</h3>
              {selectedTenantId && isDemoTenantId(selectedTenantId) ? (
                <p className="muted">{t.demoReadOnly}</p>
              ) : (
                <>
                  <div className="modalActions">
                    <label>
                      {t.branch}
                      <select value={opsBranchId} onChange={(e) => setOpsBranchId(e.target.value)}>
                        <option value="">{t.selectBranch}</option>
                        {branches.map((b) => (
                          <option key={b.id} value={b.id}>
                            {b.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <div className="formGrid">
                    <label>
                      {t.staff}
                      <select
                        value={scheduleCreateForm.staffUserId}
                        onChange={(e) => setScheduleCreateForm((s) => ({ ...s, staffUserId: e.target.value }))}
                      >
                        <option value="">{t.chooseStaff}</option>
                        {staffUserOptions.map((staff) => (
                          <option key={staff.id} value={staff.id}>
                            {staff.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      {t.scheduleStart}
                      <input
                        type="datetime-local"
                        value={scheduleCreateForm.startsAt}
                        onChange={(e) => setScheduleCreateForm((s) => ({ ...s, startsAt: e.target.value }))}
                      />
                    </label>
                    <label>
                      {t.scheduleEnd}
                      <input
                        type="datetime-local"
                        value={scheduleCreateForm.endsAt}
                        onChange={(e) => setScheduleCreateForm((s) => ({ ...s, endsAt: e.target.value }))}
                      />
                    </label>
                  </div>
                  <div className="modalActions">
                    <button
                      className="primaryBtn"
                      type="button"
                      disabled={
                        !selectedTenantId ||
                        !opsBranchId ||
                        !scheduleCreateForm.staffUserId ||
                        !scheduleCreateForm.startsAt ||
                        !scheduleCreateForm.endsAt
                      }
                      onClick={async () => {
                        if (!selectedTenantId || !opsBranchId) return;
                        try {
                          await apiPost(
                            '/schedules',
                            {
                              branchId: opsBranchId,
                              staffUserId: scheduleCreateForm.staffUserId,
                              startsAt: new Date(scheduleCreateForm.startsAt).toISOString(),
                              endsAt: new Date(scheduleCreateForm.endsAt).toISOString(),
                            },
                            { 'x-tenant-id': selectedTenantId },
                          );
                          await reloadSchedules();
                          setScheduleCreateForm({ staffUserId: '', startsAt: '', endsAt: '' });
                          setActionMessage(t.scheduleCreated);
                        } catch (err) {
                          setActionMessage(`${t.scheduleCreateFailed}: ${getApiErrorMessage(err)}`);
                        }
                      }}
                    >
                      {t.addSchedule}
                    </button>
                  </div>
                </>
              )}
              <div className="tableWrap">
                <table>
                  <thead>
                    <tr>
                      <th>{t.staff}</th>
                      <th>{t.branch}</th>
                      <th>{t.time}</th>
                      <th>{t.action}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {scheduleRows.map((s) => (
                      <tr key={s.id}>
                        <td>{s.staffUser?.fullName ?? '—'}</td>
                        <td>{s.branch.name}</td>
                        <td>
                          {new Date(s.startsAt).toLocaleString()} → {new Date(s.endsAt).toLocaleString()}
                        </td>
                        <td>
                          <button
                            className="ghostBtn"
                            type="button"
                            disabled={!selectedTenantId || isDemoTenantId(selectedTenantId)}
                            onClick={async () => {
                              if (!window.confirm(t.confirmDeleteSchedule)) return;
                              try {
                                await apiDelete(`/schedules/${s.id}`, { 'x-tenant-id': selectedTenantId });
                                await reloadSchedules();
                                setActionMessage(t.scheduleDeleted);
                              } catch (err) {
                                setActionMessage(`${t.scheduleDeleteFailed}: ${getApiErrorMessage(err)}`);
                              }
                            }}
                          >
                            {t.delete}
                          </button>
                        </td>
                      </tr>
                    ))}
                    {scheduleRows.length === 0 ? (
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

            <article className="card wide">
              <h3>{t.staffNotifications}</h3>
              <div className="modalActions">
                <select value={selectedStaffId} onChange={(e) => setSelectedStaffId(e.target.value)}>
                  <option value="">{t.chooseStaff}</option>
                  {opsStaffSelect.map((staff) => (
                    <option key={staff.id} value={staff.id}>
                      {staff.name}
                    </option>
                  ))}
                </select>
                <button
                  className="ghostBtn"
                  type="button"
                  onClick={async () => {
                    if (!selectedTenantId || !selectedStaffId) return;
                    try {
                      const rows = await apiGetWithHeaders<NotificationRow[]>(
                        `/employee/notifications?staffUserId=${selectedStaffId}`,
                        { 'x-tenant-id': selectedTenantId },
                      );
                      setNotifications(rows);
                    } catch (err) {
                      setNotifications([]);
                      setActionMessage(`${t.notificationsLoadFailed}: ${getApiErrorMessage(err)}`);
                    }
                  }}
                  disabled={!selectedStaffId}
                >
                  {t.refresh}
                </button>
              </div>
              <div className="tableWrap">
                <table>
                  <thead>
                    <tr>
                      <th>{t.date}</th>
                      <th>{t.description}</th>
                      <th>{t.status}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {notifications.map((n) => (
                      <tr key={n.id}>
                        <td>{new Date(n.createdAt).toLocaleString()}</td>
                        <td>{n.action}</td>
                        <td>
                          <span className="badge">{n.metadata?.toStatus ?? 'NEW'}</span>
                        </td>
                      </tr>
                    ))}
                    {notifications.length === 0 ? (
                      <tr>
                        <td colSpan={3} className="muted">
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

        {tab === 'accounting' ? (
          <section className="contentGrid single">
            <article className="card wide accountingCard">
              <div className="accountingHead">
                <div>
                  <h3>{t.preAccounting}</h3>
                  <p className="muted accountingLead">{t.accountingDashboardLead}</p>
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
                      } catch (err) {
                        setActionMessage(`${t.cashInFailed}: ${getApiErrorMessage(err)}`);
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
                    {ledger.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="ledgerEmptyCell">
                          {t.ledgerEmptyHint}
                        </td>
                      </tr>
                    ) : (
                      ledger.map((row) => (
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
                      ))
                    )}
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
              <p className="muted saasStripeHint">
                {stripeStatus?.secretKeyConfigured ? t.stripeSecretOk : t.stripeSecretMissing}{' '}
                {stripeStatus?.publishableKey ? `${t.stripePublishablePrefix} ${stripeStatus.publishableKey.slice(0, 12)}…` : t.stripePublishableMissing}
              </p>
              <div className="tableWrap">
                <table>
                  <thead>
                    <tr>
                      <th>{t.slug}</th>
                      <th>{t.name}</th>
                      <th>{t.amount}</th>
                      <th>{t.plan}</th>
                      <th>{t.sortOrderLabel}</th>
                      <th>{t.stripeProductCol}</th>
                      <th>{t.stripePriceCol}</th>
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
                            placeholder="prod_..."
                            value={p.stripeProductId ?? ''}
                            onChange={(e) =>
                              setLocalPlans((prev) => prev.map((x) => (x.id === p.id ? { ...x, stripeProductId: e.target.value || null } : x)))
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
                                  stripeProductId: p.stripeProductId,
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
          </>
        ) : null}
      </section>

      {userModalMode ? (
        <div className="modalBackdrop">
          <div className="modalCard">
            <h3>{userModalMode === 'employee' ? t.addEmployee : t.addManager}</h3>
            <div className="formGrid">
              <label>
                {t.name}
                <input
                  value={userCreateForm.fullName}
                  onChange={(e) => setUserCreateForm((s) => ({ ...s, fullName: e.target.value }))}
                />
              </label>
              <label>
                {t.email}
                <input
                  type="email"
                  value={userCreateForm.email}
                  onChange={(e) => setUserCreateForm((s) => ({ ...s, email: e.target.value }))}
                />
              </label>
              <label>
                {t.branch}
                <select
                  value={userCreateForm.branchId}
                  onChange={(e) => setUserCreateForm((s) => ({ ...s, branchId: e.target.value }))}
                >
                  <option value="">{t.selectBranch}</option>
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </label>
              {userModalMode === 'employee' ? (
                <label>
                  {t.specialty}
                  <input
                    value={userCreateForm.specialty}
                    onChange={(e) => setUserCreateForm((s) => ({ ...s, specialty: e.target.value }))}
                  />
                </label>
              ) : null}
            </div>
            <div className="modalActions">
              <button className="ghostBtn" type="button" onClick={() => setUserModalMode(null)}>
                {t.cancel}
              </button>
              <button
                className="primaryBtn"
                type="button"
                disabled={!selectedTenantId || !userCreateForm.email.trim() || !userCreateForm.fullName.trim()}
                onClick={async () => {
                  if (!selectedTenantId) return;
                  try {
                    await apiPost(
                      '/tenants/users',
                      {
                        email: userCreateForm.email.trim(),
                        fullName: userCreateForm.fullName.trim(),
                        branchId: userCreateForm.branchId || null,
                        isStaff: userModalMode === 'employee',
                        specialty: userModalMode === 'employee' ? userCreateForm.specialty || 'General' : null,
                        roleCodes: userModalMode === 'employee' ? ['STAFF'] : ['ADMIN'],
                      },
                      { 'x-tenant-id': selectedTenantId },
                    );
                    const rows = await apiGetWithHeaders<TenantUserRow[]>('/tenants/users', { 'x-tenant-id': selectedTenantId });
                    setTenantUsers(rows);
                    setUserModalMode(null);
                    setUserCreateForm({ email: '', fullName: '', branchId: '', specialty: '' });
                    setActionMessage(t.userCreated);
                  } catch {
                    setActionMessage(t.userCreateFailed);
                  }
                }}
              >
                {t.save}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {serviceEditDraft ? (
        <div className="modalBackdrop">
          <div className="modalCard">
            <h3>{t.editService}</h3>
            <div className="formGrid">
              <label>
                {t.name}
                <input
                  value={serviceEditDraft.name}
                  onChange={(e) => setServiceEditDraft((s) => (s ? { ...s, name: e.target.value } : s))}
                />
              </label>
              <label>
                {t.duration}
                <input
                  type="number"
                  value={serviceEditDraft.durationMin}
                  onChange={(e) =>
                    setServiceEditDraft((s) => (s ? { ...s, durationMin: Number(e.target.value) } : s))
                  }
                />
              </label>
              <label>
                {t.amount}
                <input
                  type="number"
                  value={serviceEditDraft.priceAmount}
                  onChange={(e) =>
                    setServiceEditDraft((s) => (s ? { ...s, priceAmount: Number(e.target.value) } : s))
                  }
                />
              </label>
            </div>
            <div className="modalActions">
              <button className="ghostBtn" type="button" onClick={() => setServiceEditDraft(null)}>
                {t.cancel}
              </button>
              <button
                className="primaryBtn"
                type="button"
                disabled={!selectedTenantId || isDemoTenantId(selectedTenantId)}
                onClick={async () => {
                  if (!selectedTenantId || !serviceEditDraft) return;
                  try {
                    await apiPatch(
                      `/services/${serviceEditDraft.id}`,
                      {
                        name: serviceEditDraft.name.trim(),
                        durationMin: serviceEditDraft.durationMin,
                        priceAmount: serviceEditDraft.priceAmount,
                      },
                      { 'x-tenant-id': selectedTenantId },
                    );
                    const rows = await apiGetWithHeaders<ServiceLite[]>(
                      `/services?branchId=${serviceForm.branchId}`,
                      { 'x-tenant-id': selectedTenantId },
                    );
                    setBranchServices(rows);
                    setServiceEditDraft(null);
                    setActionMessage(t.serviceUpdated);
                  } catch (err) {
                    setActionMessage(`${t.serviceUpdateFailed}: ${getApiErrorMessage(err)}`);
                  }
                }}
              >
                {t.save}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
