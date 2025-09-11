import { Module, forwardRef } from '@nestjs/common';
import { RecurringService } from './recurring.service';
import { RecurringController } from './recurring.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { TasksModule } from '../tasks/tasks.module';
import { RecurringScheduler } from './recurring.scheduler';

@Module({
  imports: [PrismaModule, forwardRef(() => TasksModule)],
  providers: [RecurringService, RecurringScheduler],
  controllers: [RecurringController],
  exports: [RecurringService],
})
export class RecurringModule {}
