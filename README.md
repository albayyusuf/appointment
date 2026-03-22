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

## Git push (GitHub)

GitHub HTTPS ile hesap şifresi kabul etmez; **PAT** veya **SSH** kullanın.

### PAT ile push (terminal — önerilen kullanım)

**Gerçek token’ı bu dosyaya veya kalıcı `git remote` URL’sine yazmayın** (commit’lenirse herkes görür). PAT: GitHub → **Settings → Developer settings → Personal access tokens** (`repo` yetkisi). Eski bir token sızdıysa GitHub’da **iptal** edip yenisini oluşturun.

**1) `origin` yoksa** (yeni klon / remote eklenmemiş):

```bash
cd /path/to/appointment
git remote add origin https://github.com/albayyusuf/appointment.git
git branch -M main
git push -u origin main
```

İlk push’ta kullanıcı adı + şifre sorarsa **şifre yerine PAT** girin (token’ı URL’ye yazmayın).

**2) PAT’yi URL’de tek sefer kullanmak** (yalnızca terminalde; `KULLANICI_ADINIZ` ve `GITHUB_PAT` kendi değerleriniz):

```bash
cd /path/to/appointment
git push https://KULLANICI_ADINIZ:GITHUB_PAT@github.com/albayyusuf/appointment.git main
```

Mevcut branch’i uzaktaki `main`’e göndermek için:

```bash
git push https://KULLANICI_ADINIZ:GITHUB_PAT@github.com/albayyusuf/appointment.git HEAD:main
```

**3) `origin` zaten varsa** token’lı URL eklemeyin; güncellemek için:

```bash
git remote set-url origin https://github.com/albayyusuf/appointment.git
git push origin main
```

Push sonrası `git remote -v` çıktısında **asla** `ghp_...` görünmemeli; görünüyorsa yukarıdaki gibi HTTPS URL’yi token’sız ayarlayın.

### Alternatif: token’ı URL’ye hiç yazmadan

```bash
gh auth login
cd /path/to/appointment
git push origin main
```

**SSH:**

```bash
git remote set-url origin git@github.com:albayyusuf/appointment.git
git push origin main
```

### Push hata verirse: `Invalid username or token`

Olası nedenler:

| Olası neden | Ne yapmalı |
|-------------|------------|
| `git remote` URL’sinde token **iptal** veya **süresi dolmuş** | GitHub’da yeni PAT oluştur; sızdıysa eskisini iptal et. |
| **macOS Keychain** eski/yanlış şifre saklıyor | `git push` sırasında URL’deki token yerine Keychain’deki kayıt kullanılabilir. |
| **Fine-grained** PAT | Repo’ya **Contents: Read and write** veya klasik PAT’ta **`repo`** yetkisi olmalı. |
| Yanlış hesap | `albayyusuf/appointment` için push yetkisi olan GitHub hesabıyla giriş yapılmalı. |

Token’sız URL’ye dönün ve kimlik bilgisini temizleyin:

```bash
git remote set-url origin https://github.com/albayyusuf/appointment.git
# macOS: GitHub için eski kaydı silmek (isteğe bağlı)
printf "protocol=https\nhost=github.com\n" | git credential-osxkeychain erase
```

Sonra `git push origin main` — kullanıcı adı: **GitHub kullanıcı adınız**, şifre: **yeni PAT** (şifre alanına yapıştırın).

En sorunsuz yöntem: **`gh auth login`** (tarayıcı ile giriş) veya **SSH** kullanın.
