export const guestRows = [
  { name: 'Ayşe Demir', phone: '+90 530 111 11 11', latestReservation: 'Kesim + Fön — 10:30', status: 'VIP' },
  { name: 'Mehmet Kaya', phone: '+90 530 222 22 22', latestReservation: 'Muayene — 11:15', status: 'Regular' },
  { name: 'John Doe', phone: '+90 530 333 33 33', latestReservation: 'Hydrafacial — 12:00', status: 'New' },
  { name: 'Zehra Polat', phone: '+90 530 444 44 44', latestReservation: 'Kanal tedavi — 14:00', status: 'Regular' },
  { name: 'Can Erkin', phone: '+90 530 555 55 55', latestReservation: 'Efor testi — 09:15', status: 'VIP' },
];

export const employeeRows = [
  { fullName: 'Elif Yılmaz', role: 'Senior Stylist', branch: 'Çankaya HQ', load: '87%' },
  { fullName: 'Dr. Selim Türk', role: 'Diş Hekimi', branch: 'Balgat', load: '72%' },
  { fullName: 'Merve Acar', role: 'Medikal Estetik', branch: 'Etimesgut', load: '64%' },
  { fullName: 'Deniz Koral', role: 'Colorist', branch: 'Alsancak', load: '91%' },
  { fullName: 'Dr. Ayşe Korkmaz', role: 'Ortodonti', branch: 'Çankaya HQ', load: '58%' },
  { fullName: 'Barış Önen', role: 'Resepsiyon', branch: 'Bornova', load: '44%' },
];

export const managerRows = [
  { fullName: 'Onur Demir', role: 'Branch Manager', branch: 'HQ', teamSize: 18 },
  { fullName: 'Sena Koc', role: 'Operations Manager', branch: 'B1', teamSize: 12 },
];

export const companyRoles = [
  { role: 'Company Owner', permissions: 'Full Company Access' },
  { role: 'Finance Manager', permissions: 'Invoices, payments, reports' },
  { role: 'HR Manager', permissions: 'Employee and shift management' },
];

export const franchiseRoles = [
  { role: 'Franchise Admin', permissions: 'Multi-branch control' },
  { role: 'Branch Supervisor', permissions: 'Branch level operations' },
];

export const subRoles = [
  { role: 'Receptionist', parent: 'Branch Supervisor', permissions: 'Create reservations, guest check-in' },
  { role: 'Cashier', parent: 'Finance Manager', permissions: 'Collect payment, issue receipts' },
  { role: 'Assistant', parent: 'Franchise Admin', permissions: 'View-only operational dashboards' },
];

export const services = [
  { name: 'Hair Cut', category: 'Beauty', duration: '45 min', price: '550 TRY' },
  { name: 'Skin Care', category: 'Beauty', duration: '60 min', price: '900 TRY' },
  { name: 'Dental Check', category: 'Health', duration: '30 min', price: '1200 TRY' },
];

export const assignmentRows = [
  { appointmentId: 'appt-demo-1', guest: 'Ayse Demir', reservation: 'Hair Cut 10:30', employee: 'Elif Yilmaz', branch: 'HQ', tenantSlug: 'demo-tenant' },
  { appointmentId: 'appt-demo-2', guest: 'Mehmet Kaya', reservation: 'Dental Check 11:15', employee: 'Dr. Selim Turk', branch: 'B1', tenantSlug: 'demo-tenant' },
];

export const accountingRows = [
  { date: '2026-03-20', type: 'Income', description: 'Appointments', amount: '+48,300 TRY' },
  { date: '2026-03-20', type: 'Expense', description: 'Supplies', amount: '-6,200 TRY' },
  { date: '2026-03-20', type: 'Expense', description: 'Payroll', amount: '-18,450 TRY' },
];
