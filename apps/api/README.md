<p align="center">
  <a href="http://nestjs.com/" target="blank"><img src="https://nestjs.com/img/logo-small.svg" width="120" alt="Nest Logo" /></a>
</p>

[circleci-image]: https://img.shields.io/circleci/build/github/nestjs/nest/master?token=abc123def456
[circleci-url]: https://circleci.com/gh/nestjs/nest

  <p align="center">A progressive <a href="http://nodejs.org" target="_blank">Node.js</a> framework for building efficient and scalable server-side applications.</p>
    <p align="center">
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/v/@nestjs/core.svg" alt="NPM Version" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/l/@nestjs/core.svg" alt="Package License" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/dm/@nestjs/common.svg" alt="NPM Downloads" /></a>
<a href="https://circleci.com/gh/nestjs/nest" target="_blank"><img src="https://img.shields.io/circleci/build/github/nestjs/nest/master" alt="CircleCI" /></a>
<a href="https://discord.gg/G7Qnnhy" target="_blank"><img src="https://img.shields.io/badge/discord-online-brightgreen.svg" alt="Discord"/></a>
<a href="https://opencollective.com/nest#backer" target="_blank"><img src="https://opencollective.com/nest/backers/badge.svg" alt="Backers on Open Collective" /></a>
<a href="https://opencollective.com/nest#sponsor" target="_blank"><img src="https://opencollective.com/nest/sponsors/badge.svg" alt="Sponsors on Open Collective" /></a>
  <a href="https://paypal.me/kamilmysliwiec" target="_blank"><img src="https://img.shields.io/badge/Donate-PayPal-ff3f59.svg" alt="Donate us"/></a>
    <a href="https://opencollective.com/nest#sponsor"  target="_blank"><img src="https://img.shields.io/badge/Support%20us-Open%20Collective-41B883.svg" alt="Support us"></a>
  <a href="https://twitter.com/nestframework" target="_blank"><img src="https://img.shields.io/twitter/follow/nestframework.svg?style=social&label=Follow" alt="Follow us on Twitter"></a>
</p>
  <!--[![Backers on Open Collective](https://opencollective.com/nest/backers/badge.svg)](https://opencollective.com/nest#backer)
  [![Sponsors on Open Collective](https://opencollective.com/nest/sponsors/badge.svg)](https://opencollective.com/nest#sponsor)-->

## Description

[Nest](https://github.com/nestjs/nest) framework TypeScript starter repository.

### AppointmentOS — SaaS paketleri ve ödeme

- **Başvuru / onboard:** `POST /saas/onboard` — firma bilgileri, **`adminPassword`** (en az 8 karakter, bcrypt ile hash’lenir), isteğe bağlı **`companyPhone`** (`Tenant.phone`). Yönetici şifresi başvuru formunda alınır (ödeme sonrası değil).
- **Paketler:** `Plan` modeli (`sortOrder`, `badgeLabel`, `stripePriceId`, `featureLines`). Public liste: `GET /saas/plans`.
- **Platform yönetimi (süper admin paneli):** `GET|POST|PATCH /platform/plans`, `GET|POST|PATCH /platform/bank-accounts`.
- **Havale/EFT:** `GET /saas/bank-accounts` (aktif hesaplar). Seed’de örnek IBAN.
- **Kiracı paneli:** `GET /saas/tenant-billing?tenantSlug=...` (abonelik, ödemeler, IBAN listesi), `GET /saas/tenant-overview?tenantSlug=...` (şube/personel/randevu/defter özeti + abonelik durumu).
- **Stripe:** `apps/api/.env` → `STRIPE_SECRET_KEY` (zorunlu), `STRIPE_PUBLISHABLE_KEY` (isteğe bağlı; panel göstergesi). `GET /saas/stripe/config` — publishable öneki ve secret tanımlı mı (anahtarları döndürmez).
- **Checkout:** `POST /saas/stripe/checkout-session` — `planCode`, **`subscriptionId`**, `successUrl`, `cancelUrl`, `customerEmail`. Satır kalemi için planda **`stripePriceId` (`price_…`)** veya yalnızca **`stripeProductId` (`prod_…`)**; ürün ID verilmişse API, Stripe’dan planın `interval`’ine (aylık/yıllık) uygun recurring **price** seçer.
- **Tamamlama:** `POST /saas/stripe/complete-checkout` — `{ sessionId }` (success URL’deki `session_id`).
- **CORS:** `main.ts` içinde `enableCors`; production’da `CORS_ORIGIN=https://app.example.com,https://www.example.com`.
- **Migration:** `npm run db:migrate` veya `npx prisma migrate deploy` (CI/production).

### Kiracı API (header: `x-tenant-id`)

- **Şubeler:** `GET|POST /branches`, `PATCH|DELETE /branches/:id`
- **Hizmet kataloğu:** `GET /services?branchId=…`, `POST /services`, `PATCH|DELETE /services/:id`
- **Kullanıcılar:** `GET|POST /tenants/users`, `PATCH|DELETE /tenants/users/:id`
- **Vardiyalar:** `GET /schedules` (`branchId`, `staffUserId`, `from`, `to`), `POST /schedules`, `DELETE /schedules/:id`
- **Rezervasyon iptal:** `POST /employee/reservations/:id/cancel` (gövde: `changedByEmail` vb.)

### Misafir & restoran (header: `x-tenant-id`)

- **Müsaitlik:** `GET /guest/availability?branchId=&serviceId=&date=&staffUserId?`
- **Takvim:** `GET /guest/staff-calendar?branchId=&date=&serviceId?` (RESTAURANT’da alan satırları)
- **Alanlar:** `GET /guest/restaurant-areas?branchId=`
- **Fiyat ipucu:** `GET /guest/pricing-hint?branchId=&date=` → özel gün kuralı özeti
- **Rezervasyon:** `POST /guest/reservations` — RESTAURANT’ta `staffUserId` **restoran alanı id**’sidir
- **Önemli gün:** `POST /employee/branch-pricing-day` (gövde: `branchId`, `dateYmd`, `surchargePercent?`, `extraAmount?`, …), **liste:** `GET /employee/branch-pricing-days?branchId=`

## Project setup

```bash
$ npm install
```

## Compile and run the project

İlk çalıştırmada veya `dist` silindiyse: `npm run build`. Watch modunda `dist/main.js` bulunamıyorsa yine bir kez `npm run build` çalıştırın.

```bash
# development
$ npm run start

# watch mode
$ npm run start:dev

# production mode
$ npm run start:prod
```

## Run tests

```bash
# unit tests
$ npm run test

# e2e tests
$ npm run test:e2e

# test coverage
$ npm run test:cov
```

## Deployment

When you're ready to deploy your NestJS application to production, there are some key steps you can take to ensure it runs as efficiently as possible. Check out the [deployment documentation](https://docs.nestjs.com/deployment) for more information.

If you are looking for a cloud-based platform to deploy your NestJS application, check out [Mau](https://mau.nestjs.com), our official platform for deploying NestJS applications on AWS. Mau makes deployment straightforward and fast, requiring just a few simple steps:

```bash
$ npm install -g @nestjs/mau
$ mau deploy
```

With Mau, you can deploy your application in just a few clicks, allowing you to focus on building features rather than managing infrastructure.

## Resources

Check out a few resources that may come in handy when working with NestJS:

- Visit the [NestJS Documentation](https://docs.nestjs.com) to learn more about the framework.
- For questions and support, please visit our [Discord channel](https://discord.gg/G7Qnnhy).
- To dive deeper and get more hands-on experience, check out our official video [courses](https://courses.nestjs.com/).
- Deploy your application to AWS with the help of [NestJS Mau](https://mau.nestjs.com) in just a few clicks.
- Visualize your application graph and interact with the NestJS application in real-time using [NestJS Devtools](https://devtools.nestjs.com).
- Need help with your project (part-time to full-time)? Check out our official [enterprise support](https://enterprise.nestjs.com).
- To stay in the loop and get updates, follow us on [X](https://x.com/nestframework) and [LinkedIn](https://linkedin.com/company/nestjs).
- Looking for a job, or have a job to offer? Check out our official [Jobs board](https://jobs.nestjs.com).

## Support

Nest is an MIT-licensed open source project. It can grow thanks to the sponsors and support by the amazing backers. If you'd like to join them, please [read more here](https://docs.nestjs.com/support).

## Stay in touch

- Author - [Kamil Myśliwiec](https://twitter.com/kammysliwiec)
- Website - [https://nestjs.com](https://nestjs.com/)
- Twitter - [@nestframework](https://twitter.com/nestframework)

## License

Nest is [MIT licensed](https://github.com/nestjs/nest/blob/master/LICENSE).
