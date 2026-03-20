import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { BranchController } from './branch.controller';
import { BranchService } from './branch.service';

@Module({
  imports: [PrismaModule],
  controllers: [BranchController],
  providers: [BranchService],
})
export class BranchModule {}
