import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { RecurringService } from './recurring.service';
import { TasksService } from '../tasks/tasks.service';
import { Role, TaskPriority } from '@prisma/client';

@Injectable()
export class RecurringScheduler {
  private readonly logger = new Logger(RecurringScheduler.name);

  constructor(
    private readonly recurringService: RecurringService,
    private readonly tasksService: TasksService,
  ) {}

  // Check every 30 seconds for due recurring tasks
  @Cron(CronExpression.EVERY_30_SECONDS)
  async handleCron() {
    const now = new Date();
    const due = await this.recurringService.findDue(now);
    if (due.length === 0) return;

    this.logger.log(`Found ${due.length} due recurring task(s)`);

    for (const r of due) {
      try {
        const task = await this.tasksService.create({
          description: r.description,
          createdBy: r.createdBy as Role,
          priority: r.priority as TaskPriority,
          model: r.model,
        });

        // Immediately queue it so AgentScheduler can pick it up
        await this.tasksService.update(task.id, { queuedAt: now });

        // Mark recurring task ran and compute next
        await this.recurringService.markRan(r.id, now);
        this.logger.debug(`Spawned task ${task.id} from recurring ${r.id}`);
      } catch (e: any) {
        this.logger.error(`Failed to spawn task from recurring ${r.id}: ${e.message}`);
      }
    }
  }
}
