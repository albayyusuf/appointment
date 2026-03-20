import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { BillingInterval } from '@prisma/client';
import { SaasService } from './saas.service';

type CreatePlanBody = {
  code: string;
  name: string;
  description?: string;
  sortOrder?: number;
  badgeLabel?: string | null;
  stripePriceId?: string | null;
  featureLines?: unknown;
  priceAmount: number;
  currency?: string;
  interval: BillingInterval;
  trialDays?: number;
  maxBranches?: number;
  maxStaff?: number;
  maxAppointmentsMo?: number;
  isActive?: boolean;
};

/** Süper admin: paket ve banka yönetimi (panelden; prod’da auth ekleyin) */
@Controller('platform')
export class PlatformSaasController {
  constructor(private readonly saasService: SaasService) {}

  @Get('plans')
  listPlansAdmin() {
    return this.saasService.listPlansAdmin();
  }

  @Post('plans')
  createPlan(@Body() body: CreatePlanBody) {
    return this.saasService.createPlan(body);
  }

  @Patch('plans/:id')
  updatePlan(@Param('id') id: string, @Body() body: Partial<CreatePlanBody>) {
    return this.saasService.updatePlan(id, body);
  }

  @Get('bank-accounts')
  listBankAccountsAdmin() {
    return this.saasService.listBankAccounts(true);
  }

  @Post('bank-accounts')
  createBank(
    @Body()
    body: {
      label: string;
      bankName: string;
      accountHolder: string;
      iban: string;
      swift?: string | null;
      currency?: string;
      sortOrder?: number;
      isActive?: boolean;
    },
  ) {
    return this.saasService.createBankAccount(body);
  }

  @Patch('bank-accounts/:id')
  updateBank(
    @Param('id') id: string,
    @Body()
    body: Partial<{
      label: string;
      bankName: string;
      accountHolder: string;
      iban: string;
      swift: string | null;
      currency: string;
      sortOrder: number;
      isActive: boolean;
    }>,
  ) {
    return this.saasService.updateBankAccount(id, body);
  }
}
