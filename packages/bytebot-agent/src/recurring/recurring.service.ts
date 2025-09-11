import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Role, TaskPriority } from '@prisma/client';
import parser from 'cron-parser';

export interface CreateRecurringDto {
  description: string;
  cron: string;
  timezone: string; // IANA tz
  priority?: TaskPriority;
  model: any;
  createdBy?: Role;
}

export interface UpdateRecurringDto {
  description?: string;
  cron?: string;
  timezone?: string;
  active?: boolean;
  priority?: TaskPriority;
  model?: any;
}

@Injectable()
export class RecurringService {
  private readonly logger = new Logger(RecurringService.name);

  constructor(private readonly prisma: PrismaService) {}

  private computeNextRun(cron: string, timezone: string, from?: Date): Date {
    try {
      const interval = parser.parseExpression(cron, { tz: timezone, currentDate: from });
      return interval.next().toDate();
    } catch (e: any) {
      throw new BadRequestException(`Invalid cron or timezone: ${e.message}`);
    }
  }

  async create(data: CreateRecurringDto) {
    const now = new Date();
    const nextRunAt = this.computeNextRun(data.cron, data.timezone, now);

    return this.prisma.recurringTask.create({
      data: {
        description: data.description,
        cron: data.cron,
        timezone: data.timezone,
        priority: data.priority ?? TaskPriority.MEDIUM,
        createdBy: data.createdBy ?? Role.USER,
        model: data.model,
        active: true,
        nextRunAt,
      },
    });
  }

  async list(active?: boolean) {
    return this.prisma.recurringTask.findMany({
      where: typeof active === 'boolean' ? { active } : {},
      orderBy: { nextRunAt: 'asc' },
    });
  }

  async get(id: string) {
    return this.prisma.recurringTask.findUnique({ where: { id } });
  }

  async update(id: string, data: UpdateRecurringDto) {
    // If cron/timezone change, recompute nextRunAt from now
    let nextRunAt: Date | undefined;
    if (data.cron || data.timezone) {
      const current = await this.get(id);
      if (!current) throw new BadRequestException('Recurring task not found');
      const cron = data.cron ?? current.cron;
      const timezone = data.timezone ?? current.timezone;
      nextRunAt = this.computeNextRun(cron, timezone, new Date());
    }

    return this.prisma.recurringTask.update({
      where: { id },
      data: { ...data, ...(nextRunAt ? { nextRunAt } : {}) },
    });
  }

  async pause(id: string) {
    return this.prisma.recurringTask.update({ where: { id }, data: { active: false } });
  }

  async resume(id: string) {
    const current = await this.get(id);
    if (!current) throw new BadRequestException('Recurring task not found');
    const nextRunAt = this.computeNextRun(current.cron, current.timezone, new Date());
    return this.prisma.recurringTask.update({ where: { id }, data: { active: true, nextRunAt } });
  }

  async remove(id: string) {
    return this.prisma.recurringTask.delete({ where: { id } });
  }

  async findDue(now = new Date()) {
    return this.prisma.recurringTask.findMany({
      where: { active: true, nextRunAt: { lte: now } },
      orderBy: { nextRunAt: 'asc' },
    });
  }

  async markRan(id: string, now = new Date()) {
    const task = await this.get(id);
    if (!task) return null;
    const nextRunAt = this.computeNextRun(task.cron, task.timezone, now);
    return this.prisma.recurringTask.update({
      where: { id },
      data: { lastRunAt: now, nextRunAt },
    });
  }
}
