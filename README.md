# Appointment Platform

Multi-tenant reservation SaaS platform (beauty + healthcare) with:
- NestJS backend + Prisma + PostgreSQL
- React web admin panel
- Seeded fake data
- Password-protected Swagger

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

## Useful Commands

```bash
npm run db:deploy
npm run db:seed
npm run build
```

## Git push (GitHub — kullanıcı + token)

GitHub artık hesap şifresi ile HTTPS push kabul etmez; **Personal Access Token (PAT)** kullanın.

1. GitHub → **Settings → Developer settings → Personal access tokens** ile token oluşturun (`repo` yetkisi yeterli).
2. Terminalde (token’ı asla repoya commit etmeyin; komut geçmişine düşebilir):

```bash
cd /path/to/appointment
git remote set-url origin https://GITHUB_KULLANICI_ADINIZ:TOKENINIZ@github.com/albayyusuf/appointment.git
git push origin main
```

3. Push bittikten sonra URL’den şifreyi kaldırın (güvenlik):

```bash
git remote set-url origin https://github.com/albayyusuf/appointment.git
```

**Not:** `GITHUB_KULLANICI_ADINIZ` GitHub kullanıcı adınız; `TOKENINIZ` PAT’tir. **Token’ı asla bu dosyaya yazmayın** — repo herkese açıksa token sızmış olur; hemen GitHub’da iptal edip yenisini oluşturun.

Push için tek seferlik (token’ı sadece kendi terminalinizde yapıştırın):

```bash
git remote set-url origin https://GITHUB_KULLANICI_ADINIZ:TOKENINIZ@github.com/albayyusuf/appointment.git
git push origin main
git remote set-url origin https://github.com/albayyusuf/appointment.git
```