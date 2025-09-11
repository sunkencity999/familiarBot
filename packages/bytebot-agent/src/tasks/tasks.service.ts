import {
  Injectable,
  NotFoundException,
  Logger,
  BadRequestException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import {
  Task,
  Role,
  Prisma,
  TaskStatus,
  TaskType,
  TaskPriority,
  File,
} from '@prisma/client';
import { AddTaskMessageDto } from './dto/add-task-message.dto';
import { TasksGateway } from './tasks.gateway';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';

@Injectable()
export class TasksService {
  private readonly logger = new Logger(TasksService.name);

  constructor(
    readonly prisma: PrismaService,
    @Inject(forwardRef(() => TasksGateway))
    private readonly tasksGateway: TasksGateway,
    private readonly configService: ConfigService,
    private readonly eventEmitter: EventEmitter2,
  ) {
    this.logger.log('TasksService initialized');
  }

  /**
   * Force-resume a task regardless of current control, marking it RUNNING and emitting resume.
   * Useful when a task is queued/PENDING but the processor got desynced.
   */
  async forceResume(taskId: string): Promise<Task> {
    this.logger.warn(`Force-resuming task ID: ${taskId}`);

    const task = await this.findById(taskId);
    if (!task) {
      throw new NotFoundException(`Task with ID ${taskId} not found`);
    }

    const updatedTask = await this.prisma.task.update({
      where: { id: taskId },
      data: {
        control: Role.ASSISTANT,
        status: TaskStatus.RUNNING,
        executedAt: task.executedAt ?? new Date(),
      },
    });

    try {
      await fetch(
        `${this.configService.get<string>('BYTEBOT_DESKTOP_BASE_URL')}/input-tracking/stop`,
        { method: 'POST' },
      );
    } catch (error) {
      this.logger.error('Failed to stop input tracking (forceResume)', error);
    }

    this.eventEmitter.emit('task.resume', { taskId });
    this.logger.log(`Task ${taskId} force-resumed`);
    this.tasksGateway.emitTaskUpdate(taskId, updatedTask);
    return updatedTask;
  }

  /**
   * Bulk delete tasks by status, with optional age and queued filters.
   * Useful for cleaning up tasks stuck in PENDING.
   */
  async deleteByStatus(
    status: TaskStatus,
    options?: { olderThanMinutes?: number; unqueuedOnly?: boolean },
  ): Promise<{ count: number; ids: string[] }> {
    this.logger.log(
      `Bulk deleting tasks by status=${status} olderThanMinutes=${options?.olderThanMinutes} unqueuedOnly=${options?.unqueuedOnly}`,
    );

    const where: Prisma.TaskWhereInput = {
      status,
      ...(options?.olderThanMinutes
        ? {
            createdAt: {
              lt: new Date(Date.now() - options!.olderThanMinutes! * 60 * 1000),
            },
          }
        : {}),
      ...(options?.unqueuedOnly ? { queuedAt: null } : {}),
    };

    // Fetch IDs first so we can emit deletion events for the UI
    const victims = await this.prisma.task.findMany({
      where,
      select: { id: true },
    });

    if (victims.length === 0) {
      return { count: 0, ids: [] };
    }

    const { count } = await this.prisma.task.deleteMany({ where });

    // Emit deletion events so subscribers update their views
    for (const v of victims) {
      this.tasksGateway.emitTaskDeleted(v.id);
    }

    this.logger.log(`Bulk deleted ${count} task(s) with status ${status}`);
    return { count, ids: victims.map((v) => v.id) };
  }

  async create(createTaskDto: CreateTaskDto): Promise<Task> {
    this.logger.log(
      `Creating new task with description: ${createTaskDto.description}`,
    );

    // Normalize and validate scheduling datetime if provided
    let normalizedScheduledFor: Date | undefined = undefined;
    if (createTaskDto.scheduledFor) {
      const candidate: any = createTaskDto.scheduledFor as any;
      const parsed = candidate instanceof Date ? candidate : new Date(candidate);
      if (isNaN(parsed.getTime())) {
        throw new BadRequestException('scheduledFor must be a valid date/time');
      }
      const now = new Date();
      if (parsed.getTime() <= now.getTime()) {
        throw new BadRequestException('scheduledFor must be in the future');
      }
      normalizedScheduledFor = parsed;
    }

    let task: Task;
    try {
      task = await this.prisma.$transaction(async (prisma) => {
        // Create the task first
        this.logger.debug('Creating task record in database');
        const task = await prisma.task.create({
          data: {
            description: createTaskDto.description,
            // If a scheduledFor date is provided, force SCHEDULED type
            type: normalizedScheduledFor ? TaskType.SCHEDULED : (createTaskDto.type || TaskType.IMMEDIATE),
            priority: createTaskDto.priority || TaskPriority.MEDIUM,
            status: TaskStatus.PENDING,
            createdBy: createTaskDto.createdBy || Role.USER,
            model: createTaskDto.model,
            ...(normalizedScheduledFor
              ? { scheduledFor: normalizedScheduledFor }
              : createTaskDto.createdBy && createTaskDto.createdBy === Role.ASSISTANT
                ? {}
                : { queuedAt: new Date() }),
          },
        });
        this.logger.log(`Task created successfully with ID: ${task.id}`);

        let filesDescription = '';

        // Save files if provided
        if (createTaskDto.files && createTaskDto.files.length > 0) {
          this.logger.debug(
            `Saving ${createTaskDto.files.length} file(s) for task ID: ${task.id}`,
          );
          filesDescription += `\n`;
        this.logger.debug(
          `Saving ${createTaskDto.files.length} file(s) for task ID: ${task.id}`,
        );
        filesDescription += `\n`;

        const filePromises = createTaskDto.files.map((file) => {
          // Extract base64 data without the data URL prefix
          const base64Data = file.base64.includes('base64,')
            ? file.base64.split('base64,')[1]
            : file.base64;

          filesDescription += `\nFile ${file.name} written to desktop.`;

          return prisma.file.create({
            data: {
              name: file.name,
              type: file.type || 'application/octet-stream',
              size: file.size,
              data: base64Data,
              taskId: task.id,
            },
          });
        });

        await Promise.all(filePromises);
        this.logger.debug(`Files saved successfully for task ID: ${task.id}`);
      }

      // Create the initial system message
      this.logger.debug(`Creating initial message for task ID: ${task.id}`);
      await prisma.message.create({
        data: {
          content: [
            {
              type: 'text',
              text: `${createTaskDto.description} ${filesDescription}`,
            },
          ] as Prisma.InputJsonValue,
          role: Role.USER,
          taskId: task.id,
        },
      });
      this.logger.debug(`Initial message created for task ID: ${task.id}`);

        return task;
      });
    } catch (err: any) {
      this.logger.error('Error during task creation', err?.stack || err);
      this.logger.error(`Payload: ${JSON.stringify({ description: createTaskDto.description, hasFiles: !!createTaskDto.files?.length, scheduledFor: normalizedScheduledFor?.toISOString(), model: createTaskDto.model })}`);
      throw err;
    }

    this.tasksGateway.emitTaskCreated(task);
    // Notify listeners (e.g., AgentScheduler) that a task was created
    this.eventEmitter.emit('task.created', { taskId: task.id });

    return task;
  }

  // Prefer tasks that have been explicitly queued (queuedAt not null),
  // then fall back to any pending/running task using the existing ordering.
  async findNextTaskPreferQueued(): Promise<(Task & { files: File[] }) | null> {
    // First try queued tasks (status PENDING and queuedAt set)
    const queuedFirst = await this.prisma.task.findFirst({
      where: {
        status: TaskStatus.PENDING,
        queuedAt: { not: null },
      },
      orderBy: [
        { priority: 'desc' },
        { queuedAt: 'asc' },
        { createdAt: 'asc' },
      ],
      include: { files: true },
    });

    if (queuedFirst) {
      this.logger.log(`Selected queued task ${queuedFirst.id} for execution`);
      return queuedFirst as any;
    }

    // Otherwise, fall back to legacy selection
    return this.findNextTask();
  }

  async findScheduledTasks(): Promise<Task[]> {
    return this.prisma.task.findMany({
      where: {
        scheduledFor: {
          not: null,
        },
        queuedAt: null,
      },
      orderBy: [{ scheduledFor: 'asc' }],
    });
  }

  async findUpcomingScheduledTasks(now: Date = new Date()): Promise<Task[]> {
    this.logger.log('Retrieving upcoming scheduled tasks');
    return this.prisma.task.findMany({
      where: {
        scheduledFor: {
          not: null,
          gt: now,
        },
        queuedAt: null,
      },
      orderBy: [{ scheduledFor: 'asc' }],
    });
  }

  async findNextTask(): Promise<(Task & { files: File[] }) | null> {
    // Exclude tasks that are scheduled for the future and have not been queued yet.
    // These should only be picked up once the scheduler sets queuedAt when due.
    const now = new Date();
    const task = await this.prisma.task.findFirst({
      where: {
        OR: [
          // Always allow resuming RUNNING tasks
          { status: TaskStatus.RUNNING },
          // For PENDING tasks, exclude those created by the assistant unless explicitly queued
          {
            AND: [
              { status: TaskStatus.PENDING },
              { createdBy: { not: Role.ASSISTANT } },
            ],
          },
        ],
        NOT: {
          AND: [
            { scheduledFor: { not: null, gt: now } },
            { queuedAt: null },
          ],
        },
      },
      orderBy: [
        { executedAt: 'asc' },
        { priority: 'desc' },
        { queuedAt: 'asc' },
        { createdAt: 'asc' },
      ],
      include: {
        files: true,
      },
    });

    if (task) {
      this.logger.log(
        `Found existing task with ID: ${task.id}, and status ${task.status}. Resuming.`,
      );
    }

    return task;
  }

  async findAll(
    page = 1,
    limit = 10,
    statuses?: string[],
  ): Promise<{ tasks: Task[]; total: number; totalPages: number }> {
    this.logger.log(
      `Retrieving tasks - page: ${page}, limit: ${limit}, statuses: ${statuses?.join(',')}`,
    );

    const skip = (page - 1) * limit;

    const whereClause: Prisma.TaskWhereInput =
      statuses && statuses.length > 0
        ? { status: { in: statuses as TaskStatus[] } }
        : {};

    const [tasks, total] = await Promise.all([
      this.prisma.task.findMany({
        where: whereClause,
        orderBy: {
          createdAt: 'desc',
        },
        skip,
        take: limit,
      }),
      this.prisma.task.count({ where: whereClause }),
    ]);

    const totalPages = Math.ceil(total / limit);
    this.logger.debug(`Retrieved ${tasks.length} tasks out of ${total} total`);

    return { tasks, total, totalPages };
  }

  async findById(id: string): Promise<Task> {
    this.logger.log(`Retrieving task by ID: ${id}`);

    try {
      const task = await this.prisma.task.findUnique({
        where: { id },
        include: {
          files: true,
        },
      });

      if (!task) {
        this.logger.warn(`Task with ID: ${id} not found`);
        throw new NotFoundException(`Task with ID ${id} not found`);
      }

      this.logger.debug(`Retrieved task with ID: ${id}`);
      return task;
    } catch (error: any) {
      this.logger.error(`Error retrieving task ID: ${id} - ${error.message}`);
      this.logger.error(error.stack);
      throw error;
    }
  }

  async update(id: string, updateTaskDto: UpdateTaskDto): Promise<Task> {
    this.logger.log(`Updating task with ID: ${id}`);
    this.logger.debug(`Update data: ${JSON.stringify(updateTaskDto)}`);

    const existingTask = await this.findById(id);

    if (!existingTask) {
      this.logger.warn(`Task with ID: ${id} not found for update`);
      throw new NotFoundException(`Task with ID ${id} not found`);
    }

    let updatedTask = await this.prisma.task.update({
      where: { id },
      data: updateTaskDto,
    });

    if (updateTaskDto.status === TaskStatus.COMPLETED) {
      this.eventEmitter.emit('task.completed', { taskId: id });
    } else if (updateTaskDto.status === TaskStatus.NEEDS_HELP) {
      updatedTask = await this.takeOver(id);
    } else if (updateTaskDto.status === TaskStatus.FAILED) {
      this.eventEmitter.emit('task.failed', { taskId: id });
    }

    this.logger.log(`Successfully updated task ID: ${id}`);
    this.logger.debug(`Updated task: ${JSON.stringify(updatedTask)}`);

    this.tasksGateway.emitTaskUpdate(id, updatedTask);

    return updatedTask;
  }

  async delete(id: string): Promise<Task> {
    this.logger.log(`Deleting task with ID: ${id}`);

    const deletedTask = await this.prisma.task.delete({
      where: { id },
    });

    this.logger.log(`Successfully deleted task ID: ${id}`);

    this.tasksGateway.emitTaskDeleted(id);

    return deletedTask;
  }

  async addTaskMessage(taskId: string, addTaskMessageDto: AddTaskMessageDto) {
    const task = await this.findById(taskId);
    if (!task) {
      this.logger.warn(`Task with ID: ${taskId} not found for guiding`);
      throw new NotFoundException(`Task with ID ${taskId} not found`);
    }

    const message = await this.prisma.message.create({
      data: {
        content: [{ type: 'text', text: addTaskMessageDto.message }],
        role: Role.USER,
        taskId,
      },
    });

    this.tasksGateway.emitNewMessage(taskId, message);
    return task;
  }

  async resume(taskId: string): Promise<Task> {
    this.logger.log(`Resuming task ID: ${taskId}`);

    const task = await this.findById(taskId);
    if (!task) {
      throw new NotFoundException(`Task with ID ${taskId} not found`);
    }

    if (task.control !== Role.USER) {
      throw new BadRequestException(`Task ${taskId} is not under user control`);
    }

    const updatedTask = await this.prisma.task.update({
      where: { id: taskId },
      data: {
        control: Role.ASSISTANT,
        status: TaskStatus.RUNNING,
      },
    });

    try {
      await fetch(
        `${this.configService.get<string>('BYTEBOT_DESKTOP_BASE_URL')}/input-tracking/stop`,
        { method: 'POST' },
      );
    } catch (error) {
      this.logger.error('Failed to stop input tracking', error);
    }

    // Broadcast resume event so AgentProcessor can react
    this.eventEmitter.emit('task.resume', { taskId });

    this.logger.log(`Task ${taskId} resumed`);
    this.tasksGateway.emitTaskUpdate(taskId, updatedTask);

    return updatedTask;
  }

  async takeOver(taskId: string): Promise<Task> {
    this.logger.log(`Taking over control for task ID: ${taskId}`);

    const task = await this.findById(taskId);
    if (!task) {
      throw new NotFoundException(`Task with ID ${taskId} not found`);
    }

    if (task.control !== Role.ASSISTANT) {
      throw new BadRequestException(
        `Task ${taskId} is not under agent control`,
      );
    }

    const updatedTask = await this.prisma.task.update({
      where: { id: taskId },
      data: {
        control: Role.USER,
      },
    });

    try {
      await fetch(
        `${this.configService.get<string>('BYTEBOT_DESKTOP_BASE_URL')}/input-tracking/start`,
        { method: 'POST' },
      );
    } catch (error) {
      this.logger.error('Failed to start input tracking', error);
    }

    // Broadcast takeover event so AgentProcessor can react
    this.eventEmitter.emit('task.takeover', { taskId });

    this.logger.log(`Task ${taskId} takeover initiated`);
    this.tasksGateway.emitTaskUpdate(taskId, updatedTask);

    return updatedTask;
  }

  async cancel(taskId: string): Promise<Task> {
    this.logger.log(`Cancelling task ID: ${taskId}`);

    const task = await this.findById(taskId);
    if (!task) {
      throw new NotFoundException(`Task with ID ${taskId} not found`);
    }

    if (
      task.status === TaskStatus.COMPLETED ||
      task.status === TaskStatus.FAILED ||
      task.status === TaskStatus.CANCELLED
    ) {
      throw new BadRequestException(
        `Task ${taskId} is already completed, failed, or cancelled`,
      );
    }

    const updatedTask = await this.prisma.task.update({
      where: { id: taskId },
      data: {
        status: TaskStatus.CANCELLED,
      },
    });

    // Broadcast cancel event so AgentProcessor can cancel processing
    this.eventEmitter.emit('task.cancel', { taskId });

    this.logger.log(`Task ${taskId} cancelled and marked as failed`);
    this.tasksGateway.emitTaskUpdate(taskId, updatedTask);

    return updatedTask;
  }
}
