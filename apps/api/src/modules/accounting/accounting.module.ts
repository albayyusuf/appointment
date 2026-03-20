import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AccountingService } from './accounting.service';
import { AccountingController } from './accounting.controller';

@Module({
  imports: [PrismaModule],
  providers: [AccountingService],
  controllers: [AccountingController],
})
export class AccountingModule {}
