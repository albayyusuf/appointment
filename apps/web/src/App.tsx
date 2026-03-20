import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Activity, Banknote, BriefcaseBusiness, Building2, ClipboardList, LayoutDashboard, MoonStar, ShieldCheck, SunMedium, Users, UserRoundCheck, UserRoundPlus, Wrench } from 'lucide-react';
import { apiGet, apiGetWithHeaders, apiPost } from './core/api/client';
import { translations, type Lang } from './i18n/translations';
import { companyRoles, employeeRows, franchiseRoles, managerRows, subRoles } from './mock/dashboardData';

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
  | 'accounting';
type Overview = { tenants: number; activeSubscriptions: number; totalPaidAmount: string | number; superAdmins: number };
type TenantSummary = { id: string; name: string; slug: string; vertical: 'BEAUTY' | 'HEALTH'; branches: number; subscriptionStatus: string; planName: string };
type Plan = { id: string; name: string; code: string; priceAmount: string; interval: 'MONTHLY' | 'YEARLY'; maxBranches: number; maxStaff: number };
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

const fallbackOverview: Overview = { tenants: 12, activeSubscriptions: 9, totalPaidAmount: '124000', superAdmins: 2 };
const fallbackTenants: TenantSummary[] = [
  { id: '1', name: 'Ankara Smile Clinic', slug: 'ankara-clinic', vertical: 'HEALTH', branches: 3, subscriptionStatus: 'ACTIVE', planName: 'Growth' },
  { id: '2', name: 'Izmir Beauty Lounge', slug: 'izmir-beauty', vertical: 'BEAUTY', branches: 2, subscriptionStatus: 'TRIAL', planName: 'Starter' },
  { id: '3', name: 'Bursa Med Center', slug: 'bursa-hospital', vertical: 'HEALTH', branches: 5, subscriptionStatus: 'PAST_DUE', planName: 'Enterprise' },
];
export function App() {
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [lang, setLang] = useState<Lang>('tr');
  const [tab, setTab] = useState<TabKey>('overview');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [employeeModalOpen, setEmployeeModalOpen] = useState(false);
  const [overview, setOverview] = useState<Overview>(fallbackOverview);
  const [tenants, setTenants] = useState<TenantSummary[]>(fallbackTenants);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [payments, setPayments] = useState<RecentPayment[]>([]);
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
  const [guestForm, setGuestForm] = useState({ branchId: '', serviceId: '', customerName: '', customerPhone: '', date: '' });
  const [availability, setAvailability] = useState<AvailabilitySlot[]>([]);
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  const [cashInForm, setCashInForm] = useState({ amount: 0, currency: 'TRY', description: '' });
  const [selectedSubscriptionId, setSelectedSubscriptionId] = useState('');
  const [branchServices, setBranchServices] = useState<ServiceLite[]>([]);
  const [reservations, setReservations] = useState<ReservationRow[]>([]);
  const [actionMessage, setActionMessage] = useState('');
  const navigate = useNavigate();
  const location = useLocation();

  const t = translations[lang];

  useEffect(() => {
    const saved = window.localStorage.getItem('app-theme');
    if (saved === 'dark' || saved === 'light') {
      setTheme(saved);
    }
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    window.localStorage.setItem('app-theme', theme);
  }, [theme]);

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
        setPlans(ps);
        setPayments(rp);
      } catch {
        // Fallback data keeps dashboard visible.
      }
    }
    load();
  }, []);

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
    overview: '/overview',
    showcase: '/showcase',
    billing: '/billing',
    operations: '/operations',
    guests: '/guests',
    employees: '/employees',
    managers: '/managers',
    companyRoles: '/roles/company',
    franchiseRoles: '/roles/franchise',
    subRoles: '/roles/sub',
    services: '/services',
    assignment: '/assignments',
    accounting: '/accounting',
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
  };
  const allowedTabsByRole: Record<DevProfile, TabKey[]> = {
    superAdmin: ['showcase', 'overview', 'billing', 'operations', 'guests', 'employees', 'managers', 'companyRoles', 'franchiseRoles', 'subRoles', 'services', 'assignment', 'accounting'],
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
      try {
        const rows = await apiGet<BranchLite[]>('/branches');
        setBranches(rows);
        if (rows[0]) {
          setServiceForm((prev) => ({ ...prev, branchId: rows[0].id }));
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
      try {
        const rows = await apiGetWithHeaders<ServiceLite[]>(`/services?branchId=${guestForm.branchId}`, { 'x-tenant-id': selectedTenantId });
        setBranchServices(rows);
        if (rows[0] && !guestForm.serviceId) {
          setGuestForm((prev) => ({ ...prev, serviceId: rows[0].id }));
        }
      } catch {
        setBranchServices([]);
      }
      try {
        const ledgerRows = await apiGetWithHeaders<LedgerEntry[]>('/accounting/ledger', { 'x-tenant-id': selectedTenantId });
        setLedger(ledgerRows);
      } catch {
        setLedger([]);
      }
      try {
        const reservationRows = await apiGetWithHeaders<ReservationRow[]>('/employee/reservations', { 'x-tenant-id': selectedTenantId });
        setReservations(reservationRows);
      } catch {
        setReservations([]);
      }
    }
    loadServicesAndLedger();
  }, [selectedTenantId, guestForm.branchId, guestForm.serviceId]);

  const selectedTenant = tenants.find((x) => x.id === selectedTenantId);
  const actorEmail = selectedTenant ? `owner@${selectedTenant.slug}.com` : 'owner@demo-tenant.com';
  const profileLabel: Record<DevProfile, string> = {
    superAdmin: t.superAdminProfile,
    companyManager: t.companyManagerProfile,
    franchiseManager: t.franchiseManagerProfile,
    employee: t.employeeProfile,
    guest: t.guestProfile,
  };

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
        </nav>
      </aside>

      <section className="content">
        <header className="topbar">
          <button className="menuToggle" onClick={() => setSidebarOpen((v) => !v)}>{t.menu}</button>
          <div>
            <h1>{t.appTitle}</h1>
            <p>{t.appSubtitle}</p>
          </div>
          <select
            className="tenantSelect"
            value={selectedTenantId}
            onChange={(e) => setSelectedTenantId(e.target.value)}
          >
            {tenants.map((tenant) => (
              <option key={tenant.id} value={tenant.id}>
                {tenant.name}
              </option>
            ))}
          </select>
          <button className="ghostBtn" onClick={() => setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'))}>
            {theme === 'dark' ? <SunMedium size={16} /> : <MoonStar size={16} />}
          </button>
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
            <span className="muted">{t.loggedInAs}: <strong>{profileLabel[devProfile]}</strong></span>
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
                  <option value="">Subscription</option>
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
                      setActionMessage('SaaS purchase simulated successfully');
                    } catch {
                      setActionMessage('SaaS purchase failed');
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
            <article className="card wide">
              <h3>{t.guestScreen}</h3>
              <div className="formGrid">
                <label>{t.selectBranch}
                  <select value={guestForm.branchId} onChange={(e) => setGuestForm((s) => ({ ...s, branchId: e.target.value }))}>
                    <option value="">{t.selectBranch}</option>
                    {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                </label>
                <label>{t.selectService}
                  <select value={guestForm.serviceId} onChange={(e) => setGuestForm((s) => ({ ...s, serviceId: e.target.value }))}>
                    <option value="">{t.selectService}</option>
                    {branchServices.map((s) => <option key={s.id} value={s.id}>{s.name} - {s.priceAmount} {s.currency}</option>)}
                  </select>
                </label>
                <label>{t.selectDate}<input type="date" value={guestForm.date} onChange={(e) => setGuestForm((s) => ({ ...s, date: e.target.value }))} /></label>
                <label>{t.name}<input value={guestForm.customerName} onChange={(e) => setGuestForm((s) => ({ ...s, customerName: e.target.value }))} /></label>
                <label>{t.phone}<input value={guestForm.customerPhone} onChange={(e) => setGuestForm((s) => ({ ...s, customerPhone: e.target.value }))} /></label>
              </div>
              <div className="modalActions">
                <button
                  className="ghostBtn"
                  onClick={async () => {
                    if (!guestForm.branchId || !guestForm.serviceId || !guestForm.date || !selectedTenantId) return;
                    try {
                      const rows = await apiGetWithHeaders<AvailabilitySlot[]>(
                        `/guest/availability?branchId=${guestForm.branchId}&serviceId=${guestForm.serviceId}&date=${guestForm.date}`,
                        { 'x-tenant-id': selectedTenantId },
                      );
                      setAvailability(rows);
                    } catch {
                      setAvailability([]);
                    }
                  }}
                >
                  {t.loadAvailability}
                </button>
              </div>
              <div className="tableWrap">
                <table>
                  <thead><tr><th>{t.staff}</th><th>{t.time}</th><th>{t.status}</th><th>{t.action}</th></tr></thead>
                  <tbody>
                    {availability.map((slot) => (
                      <tr key={`${slot.staffUserId}-${slot.startsAt}`}>
                        <td>{slot.staffName}</td>
                        <td>{new Date(slot.startsAt).toLocaleString()}</td>
                        <td><span className="badge">{t.availability}</span></td>
                        <td>
                          <button
                            className="primaryBtn"
                            onClick={async () => {
                              if (!selectedTenantId || !guestForm.customerName) return;
                              try {
                                await apiPost('/guest/reservations', {
                                  branchId: guestForm.branchId,
                                  customerName: guestForm.customerName,
                                  customerPhone: guestForm.customerPhone,
                                  serviceId: guestForm.serviceId,
                                  staffUserId: slot.staffUserId,
                                  createdByEmail: actorEmail,
                                  startsAt: slot.startsAt,
                                }, { 'x-tenant-id': selectedTenantId });
                                setActionMessage(t.reserveSuccess);
                              } catch {
                                setActionMessage(t.reserveFail);
                              }
                            }}
                          >
                            {t.reserveNow}
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

        {tab === 'companyRoles' ? <section className="contentGrid single"><article className="card wide"><h3>{t.companyRoles}</h3><div className="tableWrap"><table><thead><tr><th>{t.role}</th><th>{t.permissions}</th></tr></thead><tbody>{companyRoles.map((row) => <tr key={row.role}><td>{row.role}</td><td>{row.permissions}</td></tr>)}</tbody></table></div></article></section> : null}
        {tab === 'franchiseRoles' ? <section className="contentGrid single"><article className="card wide"><h3>{t.franchiseRoles}</h3><div className="tableWrap"><table><thead><tr><th>{t.role}</th><th>{t.permissions}</th></tr></thead><tbody>{franchiseRoles.map((row) => <tr key={row.role}><td>{row.role}</td><td>{row.permissions}</td></tr>)}</tbody></table></div></article></section> : null}
        {tab === 'subRoles' ? <section className="contentGrid single"><article className="card wide"><h3>{t.subRoles}</h3><div className="tableWrap"><table><thead><tr><th>{t.role}</th><th>{t.parent}</th><th>{t.permissions}</th></tr></thead><tbody>{subRoles.map((row) => <tr key={row.role}><td>{row.role}</td><td>{row.parent}</td><td>{row.permissions}</td></tr>)}</tbody></table></div></article></section> : null}

        {tab === 'services' ? <section className="contentGrid single"><article className="card wide"><h3>{t.servicesCatalog}</h3><div className="formGrid"><label>{t.branch}<select value={serviceForm.branchId} onChange={(e) => setServiceForm((s) => ({ ...s, branchId: e.target.value }))}>{branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></label><label>{t.category}<input value={serviceForm.categoryName} onChange={(e) => setServiceForm((s) => ({ ...s, categoryName: e.target.value }))} /></label><label>{t.name}<input value={serviceForm.name} onChange={(e) => setServiceForm((s) => ({ ...s, name: e.target.value }))} /></label><label>{t.duration}<input type="number" value={serviceForm.durationMin} onChange={(e) => setServiceForm((s) => ({ ...s, durationMin: Number(e.target.value) }))} /></label><label>{t.amount}<input type="number" value={serviceForm.priceAmount} onChange={(e) => setServiceForm((s) => ({ ...s, priceAmount: Number(e.target.value) }))} /></label><label>{t.currency}<input value={serviceForm.currency} onChange={(e) => setServiceForm((s) => ({ ...s, currency: e.target.value }))} /></label></div><div className="modalActions"><button className="ghostBtn" onClick={async () => { try { await apiPost('/tenants/settings/currency', { currency: currencyForm }, { 'x-tenant-id': selectedTenantId }); setActionMessage(t.currencyUpdated); } catch { setActionMessage(t.currencyUpdateFailed); } }}>{t.save} {t.currency}</button><input value={currencyForm} onChange={(e) => setCurrencyForm(e.target.value)} /><button className="primaryBtn" onClick={async () => { try { await apiPost('/services', serviceForm, { 'x-tenant-id': selectedTenantId }); setActionMessage(t.serviceCreated); } catch { setActionMessage(t.serviceCreateFailed); } }}>{t.save}</button></div><div className="tableWrap"><table><thead><tr><th>{t.name}</th><th>{t.category}</th><th>{t.duration}</th><th>{t.amount}</th></tr></thead><tbody>{branchServices.map((row) => <tr key={row.id}><td>{row.name}</td><td>{row.category?.name ?? '-'}</td><td>{row.durationMin}</td><td>{row.priceAmount} {row.currency}</td></tr>)}</tbody></table></div></article></section> : null}

        {tab === 'assignment' ? <section className="contentGrid single"><article className="card wide"><h3>{t.reservationAssign}</h3><div className="tableWrap"><table><thead><tr><th>{t.name}</th><th>{t.reservation}</th><th>{t.employees}</th><th>{t.branch}</th><th>{t.status}</th><th>{t.action}</th></tr></thead><tbody>{reservations.map((row) => <tr key={row.id}><td>{row.customer.fullName}</td><td>{row.service.name} / {new Date(row.startsAt).toLocaleString()}</td><td>{row.staffUser.fullName}</td><td>{row.branch.name}</td><td><span className="badge">{row.status}</span></td><td><div className="actionBtns"><button className="ghostBtn" onClick={async () => { try { await apiPost(`/employee/reservations/${row.id}/approve`, { changedByEmail: actorEmail }, { 'x-tenant-id': selectedTenantId }); const reservationRows = await apiGetWithHeaders<ReservationRow[]>('/employee/reservations', { 'x-tenant-id': selectedTenantId }); setReservations(reservationRows); setActionMessage(`${t.approved}: ${row.id}`); } catch { setActionMessage(t.approveFailed); } }}>{t.approve}</button><button className="ghostBtn" onClick={async () => { try { await apiPost(`/employee/reservations/${row.id}/start`, { changedByEmail: actorEmail }, { 'x-tenant-id': selectedTenantId }); const reservationRows = await apiGetWithHeaders<ReservationRow[]>('/employee/reservations', { 'x-tenant-id': selectedTenantId }); setReservations(reservationRows); setActionMessage(`${t.started}: ${row.id}`); } catch { setActionMessage(t.startFailed); } }}>{t.start}</button><button className="primaryBtn" onClick={async () => { try { await apiPost(`/employee/reservations/${row.id}/complete`, { changedByEmail: actorEmail }, { 'x-tenant-id': selectedTenantId }); const [reservationRows, ledgerRows] = await Promise.all([apiGetWithHeaders<ReservationRow[]>('/employee/reservations', { 'x-tenant-id': selectedTenantId }), apiGetWithHeaders<LedgerEntry[]>('/accounting/ledger', { 'x-tenant-id': selectedTenantId })]); setReservations(reservationRows); setLedger(ledgerRows); setActionMessage(`${t.completedAndAccounted}: ${row.id}`); } catch { setActionMessage(t.completeFailed); } }}>{t.complete}</button></div></td></tr>)}</tbody></table></div></article></section> : null}

        {tab === 'operations' ? (
          <section className="contentGrid single">
            <article className="card wide">
              <h3>{t.staffNotifications}</h3>
              <div className="modalActions">
                <button
                  className="ghostBtn"
                  onClick={async () => {
                    if (!selectedTenantId) return;
                    try {
                      const firstStaff = availability[0]?.staffUserId;
                      if (!firstStaff) return;
                      const rows = await apiGetWithHeaders<NotificationRow[]>(`/employee/notifications?staffUserId=${firstStaff}`, { 'x-tenant-id': selectedTenantId });
                      setNotifications(rows);
                    } catch {
                      setNotifications([]);
                    }
                  }}
                >
                  {t.loadAvailability}
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
            <article className="card wide">
              <h3>{t.preAccounting}</h3>
              <div className="formGrid">
                <label>{t.amount}<input type="number" value={cashInForm.amount} onChange={(e) => setCashInForm((s) => ({ ...s, amount: Number(e.target.value) }))} /></label>
                <label>{t.currency}<input value={cashInForm.currency} onChange={(e) => setCashInForm((s) => ({ ...s, currency: e.target.value }))} /></label>
                <label>{t.description}<input value={cashInForm.description} onChange={(e) => setCashInForm((s) => ({ ...s, description: e.target.value }))} /></label>
              </div>
              <div className="modalActions">
                <button className="primaryBtn" onClick={async () => {
                  if (!selectedTenantId) return;
                  try {
                    await apiPost('/accounting/cash-in', cashInForm, { 'x-tenant-id': selectedTenantId });
                    const ledgerRows = await apiGetWithHeaders<LedgerEntry[]>('/accounting/ledger', { 'x-tenant-id': selectedTenantId });
                    setLedger(ledgerRows);
                    setActionMessage('Cash register entry added');
                  } catch {
                    setActionMessage('Cash register entry failed');
                  }
                }}>{t.manualCashIn}</button>
              </div>
              <div className="tableWrap">
                <table>
                  <thead><tr><th>{t.date}</th><th>{t.type}</th><th>{t.description}</th><th>{t.amount}</th></tr></thead>
                  <tbody>{ledger.map((row) => <tr key={row.id}><td>{new Date(row.createdAt).toLocaleString()}</td><td>{row.type}</td><td>{row.description}</td><td>{row.amount} {row.currency}</td></tr>)}</tbody>
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
