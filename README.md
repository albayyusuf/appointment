# Appointment Platform

Multi-tenant reservation SaaS platform (beauty, healthcare **+ restaurant** seating) with:
- NestJS backend + Prisma + PostgreSQL
- React web admin panel
- Seeded fake data
- Password-protected Swagger

## Anasayfa paketleri (katalog)

| Kod | Görünen ad (katman) | Fiyat (TRY) | Dönem | Sıra | Stripe Product ID |
|-----|---------------------|-------------|-------|------|-------------------|
| `STARTER_MONTHLY` | Başlangıç | 1299 | Aylık | 1 | `prod_UCDKAVRNr1ro2o` |
| `GROWTH_MONTHLY` | Orta ölçek | 3499 | Aylık | 2 | `prod_UCDKaBRouUUOdv` |
| `ENTERPRISE_YEARLY` | Kurumsal | 34999 | Yıllık | 3 | `prod_UCDKfsX9j3LtRr` |

Liste `GET /saas/plans` ve seed (`apps/api/prisma/seed.mjs`) ile uyumludur. **`price_...`** değerlerini Süper admin → SaaS Plans ekranından veya Stripe’da ilgili ürüne bağlı recurring price olarak girebilirsiniz; boşsa API `stripeProductId` üzerinden uygun fiyatı seçer.

## Requirements
- Node.js `22+`
- PostgreSQL running locally

## Environment
Backend env file: `apps/api/.env`

Example:

```env
DATABASE_URL="postgresql://appointment:appointment@localhost:5432/appointment?schema=public"
SWAGGER_USER="admin"
SWAGGER_PASS="StrongSwaggerPass123!"
```

## One-Time Setup

Install dependencies at project root:

```bash
npm install
```

Run migrations + seed fake data:

```bash
npm run bootstrap
```

**Demo veri:** Her kiracıda **tek şube** (`HQ`); şube görünen adı sektöre göre (**güzellik** → “Merkez Salon”, **sağlık** → “Poliklinik Merkezi”, **restoran** → “Ana Restoran”). Restoranda **3 oturma alanı** (Bahçe, Teras, İç Salon). Eski kayıtları sıfırlamak için geliştirme ortamında `cd apps/api && npx prisma migrate reset` kullanın.

## Run (Single Command)

Start both backend and frontend together:

```bash
npm run dev
```

This starts:
- API: `http://127.0.0.1:3000`
- Web: `http://127.0.0.1:5174`

## Swagger (Password Protected)

Swagger URL:

```text
http://127.0.0.1:3000/swagger
```

Login with:
- username: `SWAGGER_USER`
- password: `SWAGGER_PASS`

If env vars are missing, defaults are:
- user: `admin`
- pass: `ChangeMe123!`

## Restoran & fiyat kuralları

- Misafir akışında **RESTAURANT** dikeyinde `staffUserId` alanı, API tarafında **restoran alanı** (`RestaurantArea`) kimliği olarak kullanılır.
- **Önemli gün fiyatı:** `BranchPricingDay` (şube + tarih + isteğe bağlı `%` ek / sabit ek). Kural yoksa `GET /guest/pricing-hint` → `hasRule: false` (liste fiyatı; ek günlük ücret yok).
- Panel: **Operasyon Merkezi** → restoran kiracısında “önemli gün fiyatı” kartı; demo özel gün tarihi `seed.mjs` ile **UTC bugün + 3 gün** ile hizalıdır (`demoReservationData.getDemoSpecialPricingDateYmd()`).

## Kalite kontrol (geliştirici)

- `cd apps/web && npm run build` — TS + Vite
- `cd apps/api && npm run build` — Nest derlemesi
- TR/EN çeviri anahtarları `apps/web/src/i18n/translations.ts` içinde eşit sayıda (470/470); yeni metin eklerken her iki dile ekleyin.

## Useful Commands

```bash
npm run db:deploy
npm run db:seed
npm run build
```

## Git push (GitHub) — Access Token (PAT)

Bu repo: **`albayyusuf/appointment`**. HTTPS ile **hesap şifresi** kullanılamaz; **Personal Access Token (PAT)** gerekir.

**Token’ı README’ye, remote URL’ye kalıcı yazmayın ve sohbette paylaşmayın** — sızdıysa GitHub’da **hemen iptal** edin.

### 1) PAT oluşturma

1. GitHub → **Settings → Developer settings → Personal access tokens**
2. **Classic:** `repo` (tam depo erişimi) işaretleyin.  
   **Fine-grained:** Bu repoyu seçin; **Contents: Read and write** (push için gerekli izinler).
3. Oluşturduğunuz PAT’yi **yalnızca güvenli** bir yerde saklayın (bir kez gösterilir).

### 2) Remote’u her zaman tokensız tutun

```bash
cd /path/to/appointment
git remote set-url origin https://github.com/albayyusuf/appointment.git
git remote -v
```

`origin` satırında **`ghp_` veya şifre görünmemeli**; sadece `https://github.com/albayyusuf/appointment.git` olmalı.

### 3) Push — PAT ile (önerilen)

**A) İstemci şifre istesin (Keychain’e kaydedebilir)**

```bash
git push -u origin main
```

- **Username:** `albayyusuf` (repo sahibi olan GitHub kullanıcı adı; token hangi hesaptaysa o hesabın adı)  
- **Password:** PAT’yi yapıştırın (hesap şifresi değil).

**B) Keychain’i devre dışı bırakıp tek seferde URL ile push** (token’ı yalnızca terminalde; `YENİ_PAT` yerine kendi PAT’nizi yazın)

```bash
git -c credential.helper= push https://albayyusuf:YENİ_PAT@github.com/albayyusuf/appointment.git main
```

Mevcut branch’i uzaktaki `main`’e göndermek için:

```bash
git -c credential.helper= push https://albayyusuf:YENİ_PAT@github.com/albayyusuf/appointment.git HEAD:main
```

Push bittikten sonra yine kontrol edin:

```bash
git remote set-url origin https://github.com/albayyusuf/appointment.git
```

### 4) `Invalid username or token` hatası

| Olası neden | Ne yapmalı |
|-------------|------------|
| PAT iptal / süresi dolmuş / sızdı | Yeni PAT oluştur, eskisini iptal et. |
| macOS Keychain eski kayıt kullanıyor | Aşağıdaki komutla `github.com` için silin, sonra tekrar push. |
| Fine-grained yetki eksik | Repo için **Contents: Read and write** veya classic **`repo`**. |
| Yanlış hesap | `albayyusuf/appointment` için **yazma** yetkisi olan hesabın PAT’si olmalı. |

Keychain’i temizlemek (isteğe bağlı):

```bash
git remote set-url origin https://github.com/albayyusuf/appointment.git
printf "protocol=https\nhost=github.com\n" | git credential-osxkeychain erase
git push -u origin main
```

### 5) Sadece bu projede Git kullanıcı adı / e-posta (global’i bozmaz)

```bash
cd /path/to/appointment
git config --local user.name "İsim"
git config --local user.email "email@ornek.com"
```

### 6) İsteğe bağlı: GitHub CLI

```bash
gh auth login
cd /path/to/appointment
git push origin main
```

`gh` hesabı makinede genel etkiler; PAT yöntemiyle karıştırmak istemezseniz yukarıdaki HTTPS + PAT adımları yeterlidir.

### 7) SSH alternatifi

SSH kullanmak isterseniz: `git remote set-url origin git@github.com:albayyusuf/appointment.git` ve makinenize SSH anahtarı ekleyin.
