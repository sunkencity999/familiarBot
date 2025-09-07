import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Delete,
  HttpStatus,
  HttpCode,
  Query,
  HttpException,
} from '@nestjs/common';
import { TasksService } from './tasks.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { Message, Task } from '@prisma/client';
import { AddTaskMessageDto } from './dto/add-task-message.dto';
import { MessagesService } from '../messages/messages.service';
import { ANTHROPIC_MODELS } from '../anthropic/anthropic.constants';
import { OPENAI_MODELS } from '../openai/openai.constants';
import { GOOGLE_MODELS } from '../google/google.constants';
import { BytebotAgentModel } from 'src/agent/agent.types';

const geminiApiKey = process.env.GEMINI_API_KEY;
const anthropicApiKey = process.env.ANTHROPIC_API_KEY;
const openaiApiKey = process.env.OPENAI_API_KEY;

const proxyUrl = process.env.BYTEBOT_LLM_PROXY_URL;
const vllmBaseUrl = process.env.VLLM_BASE_URL;

const models = [
  ...(anthropicApiKey && anthropicApiKey !== 'your_anthropic_api_key_here' ? ANTHROPIC_MODELS : []),
  ...(openaiApiKey ? OPENAI_MODELS : []),
  ...(geminiApiKey ? GOOGLE_MODELS : []),
];

@Controller('tasks')
export class TasksController {
  constructor(
    private readonly tasksService: TasksService,
    private readonly messagesService: MessagesService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() createTaskDto: CreateTaskDto): Promise<Task> {
    return this.tasksService.create(createTaskDto);
  }

  @Get()
  async findAll(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('status') status?: string,
    @Query('statuses') statuses?: string,
  ): Promise<{ tasks: Task[]; total: number; totalPages: number }> {
    const pageNum = page ? parseInt(page, 10) : 1;
    const limitNum = limit ? parseInt(limit, 10) : 10;

    // Handle both single status and multiple statuses
    let statusFilter: string[] | undefined;
    if (statuses) {
      statusFilter = statuses.split(',');
    } else if (status) {
      statusFilter = [status];
    }

    return this.tasksService.findAll(pageNum, limitNum, statusFilter);
  }

  @Get('models')
  async getModels() {
    const allModels: BytebotAgentModel[] = [...models];

    // Fetch models from proxy if available and filter by API keys
    if (proxyUrl) {
      try {
        const response = await fetch(`${proxyUrl}/model/info`);
        if (response.ok) {
          const proxyResponse = await response.json();
          const proxyModels: BytebotAgentModel[] = proxyResponse.data
            .filter((model: any) => {
              // Filter models based on available API keys
              const modelKey = model.litellm_params.model;
              if (modelKey.startsWith('anthropic/')) {
                return !!process.env.ANTHROPIC_API_KEY && process.env.ANTHROPIC_API_KEY !== 'your_anthropic_api_key_here';
              }
              if (modelKey.startsWith('openai/')) {
                return !!process.env.OPENAI_API_KEY;
              }
              if (modelKey.startsWith('gemini/')) {
                return !!process.env.GEMINI_API_KEY;
              }
              if (modelKey.startsWith('ollama/')) {
                return true; // Ollama doesn't require API key
              }
              // For local-openai-compat, check if LOCAL_OPENAI_BASE is set
              if (model.model_name === 'local-openai-compat') {
                return !!process.env.LOCAL_OPENAI_BASE;
              }
              return false;
            })
            .map((model: any) => ({
              provider: 'proxy',
              name: model.litellm_params.model,
              title: model.model_name,
              contextWindow: model.model_info.max_input_tokens || 128000,
            }));
          allModels.push(...proxyModels);
        }
      } catch (error) {
        console.warn('Failed to fetch proxy models:', error.message);
      }
    }

    // Fetch models from VLLM endpoint if available
    if (vllmBaseUrl) {
      try {
        const vllmApiKey = process.env.VLLM_API_KEY;
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
        };
        
        if (vllmApiKey) {
          headers['Authorization'] = `Bearer ${vllmApiKey}`;
        }

        // Try standard /v1/models endpoint first
        let response = await fetch(`${vllmBaseUrl}/models`, {
          method: 'GET',
          headers,
        });

        if (response.ok) {
          const vllmResponse = await response.json();
          const vllmModels: BytebotAgentModel[] = vllmResponse.data.map(
            (model: any) => ({
              provider: 'vllm',
              name: model.id,
              title: `VLLM: ${model.id}`,
              contextWindow: model.max_model_len || 32768,
            }),
          );
          allModels.push(...vllmModels);
        } else {
          // Fallback: try health endpoint to get model info
          const healthUrl = vllmBaseUrl.replace('/v1', '/health');
          response = await fetch(healthUrl, {
            method: 'GET',
            headers,
          });

          if (response.ok) {
            const healthResponse = await response.json();
            if (healthResponse.model) {
              const vllmModel: BytebotAgentModel = {
                provider: 'vllm',
                name: healthResponse.model,
                title: `VLLM: ${healthResponse.model}`,
                contextWindow: 32768,
              };
              allModels.push(vllmModel);
            }
          }
        }
      } catch (error) {
        console.warn('Failed to fetch VLLM models:', error.message);
      }
    }

    return allModels;
  }

  @Get(':id')
  async findById(@Param('id') id: string): Promise<Task> {
    return this.tasksService.findById(id);
  }

  @Get(':id/messages')
  async taskMessages(
    @Param('id') taskId: string,
    @Query('limit') limit?: string,
    @Query('page') page?: string,
  ): Promise<Message[]> {
    const options = {
      limit: limit ? parseInt(limit, 10) : undefined,
      page: page ? parseInt(page, 10) : undefined,
    };

    const messages = await this.messagesService.findAll(taskId, options);
    return messages;
  }

  @Post(':id/messages')
  @HttpCode(HttpStatus.CREATED)
  async addTaskMessage(
    @Param('id') taskId: string,
    @Body() guideTaskDto: AddTaskMessageDto,
  ): Promise<Task> {
    return this.tasksService.addTaskMessage(taskId, guideTaskDto);
  }

  @Get(':id/messages/raw')
  async taskRawMessages(
    @Param('id') taskId: string,
    @Query('limit') limit?: string,
    @Query('page') page?: string,
  ): Promise<Message[]> {
    const options = {
      limit: limit ? parseInt(limit, 10) : undefined,
      page: page ? parseInt(page, 10) : undefined,
    };

    return this.messagesService.findRawMessages(taskId, options);
  }

  @Get(':id/messages/processed')
  async taskProcessedMessages(
    @Param('id') taskId: string,
    @Query('limit') limit?: string,
    @Query('page') page?: string,
  ) {
    const options = {
      limit: limit ? parseInt(limit, 10) : undefined,
      page: page ? parseInt(page, 10) : undefined,
    };

    return this.messagesService.findProcessedMessages(taskId, options);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@Param('id') id: string): Promise<void> {
    await this.tasksService.delete(id);
  }

  @Post(':id/takeover')
  @HttpCode(HttpStatus.OK)
  async takeOver(@Param('id') taskId: string): Promise<Task> {
    return this.tasksService.takeOver(taskId);
  }

  @Post(':id/resume')
  @HttpCode(HttpStatus.OK)
  async resume(@Param('id') taskId: string): Promise<Task> {
    return this.tasksService.resume(taskId);
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  async cancel(@Param('id') taskId: string): Promise<Task> {
    return this.tasksService.cancel(taskId);
  }
}
