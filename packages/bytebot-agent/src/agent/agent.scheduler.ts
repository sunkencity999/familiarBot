import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { Cron, CronExpression } from '@nestjs/schedule';
import { TasksService } from '../tasks/tasks.service';
import { AgentProcessor } from './agent.processor';
import { TaskStatus } from '@prisma/client';
import { writeFile } from './agent.computer-use';

@Injectable()
export class AgentScheduler implements OnModuleInit {
  private readonly logger = new Logger(AgentScheduler.name);

  constructor(
    private readonly tasksService: TasksService,
    private readonly agentProcessor: AgentProcessor,
  ) {}

  async onModuleInit() {
    this.logger.log('AgentScheduler initialized');
    await this.handleCron();
  }

  @OnEvent('task.created')
  async onTaskCreated() {
    const immediate = process.env.BYTEBOT_SCHEDULER_IMMEDIATE === 'true';
    this.logger.log(
      `[Scheduler] task.created event received (immediate=${immediate})`,
    );
    if (!immediate) return;

    if (!this.agentProcessor.isRunning()) {
      // Peek to see if there is any queued work before invoking handleCron
      const queued = await this.tasksService.findNextTaskPreferQueued();
      if (queued) {
        await this.handleCron();
      } else {
        this.logger.log('[Scheduler] No queued tasks to start immediately');
      }
    } else {
      this.logger.log('[Scheduler] Processor busy; will pick up on next tick');
    }
  }

  @Cron(CronExpression.EVERY_5_SECONDS)
  async handleCron() {
    const now = new Date();
    const graceMs = 1500; // 1.5s grace to avoid millisecond boundary misses
    const nowWithGrace = new Date(now.getTime() + graceMs);
    this.logger.log(`[Scheduler] Tick at ${now.toISOString()}`);
    const scheduledTasks = await this.tasksService.findScheduledTasks();
    this.logger.log(
      `[Scheduler] Found ${scheduledTasks.length} scheduled tasks awaiting queueing`,
    );
    for (const scheduledTask of scheduledTasks) {
      const sf = scheduledTask.scheduledFor;
      if (sf) {
        this.logger.log(
          `[Scheduler] Inspecting task ${scheduledTask.id} scheduledFor=${sf.toISOString()} now=${now.toISOString()}`,
        );
      }
      if (scheduledTask.scheduledFor && scheduledTask.scheduledFor <= nowWithGrace) {
        this.logger.log(
          `Task ID: ${scheduledTask.id} is due; queuing it (scheduledFor=${scheduledTask.scheduledFor.toISOString()}, now=${nowWithGrace.toISOString()})`,
        );
        await this.tasksService.update(scheduledTask.id, {
          queuedAt: now,
        });
      }
    }

    if (this.agentProcessor.isRunning()) {
      // Defensive check: if processor claims running but DB has no RUNNING tasks, reset
      const runningCheck = await this.tasksService.findAll(1, 1, ['RUNNING']);
      if ((runningCheck?.total ?? 0) === 0) {
        this.logger.warn('[Scheduler] AgentProcessor marked running but no RUNNING tasks found; resetting processor state');
        await this.agentProcessor.stopProcessing();
      } else {
        this.logger.log('[Scheduler] AgentProcessor is currently running; will try again next tick');
        return;
      }
    }
    // Find the highest priority task to execute
    const task = await this.tasksService.findNextTaskPreferQueued();
    if (task) {
      if (task.files.length > 0) {
        this.logger.debug(
          `Task ID: ${task.id} has files, writing them to the desktop`,
        );
        for (const file of task.files) {
          await writeFile({
            path: `/home/user/Desktop/${file.name}`,
            content: file.data, // file.data is already base64 encoded in the database
          });
        }
      }

      await this.tasksService.update(task.id, {
        status: TaskStatus.RUNNING,
        executedAt: new Date(),
      });
      this.logger.debug(`Processing task ID: ${task.id}`);
      this.agentProcessor.processTask(task.id);
    }
  }
}
