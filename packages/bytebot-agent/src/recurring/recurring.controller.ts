import { Body, Controller, Delete, Get, HttpException, HttpStatus, Param, Patch, Post, Query } from '@nestjs/common';
import { RecurringService, CreateRecurringDto, UpdateRecurringDto } from './recurring.service';

@Controller('recurring')
export class RecurringController {
  constructor(private readonly recurring: RecurringService) {}

  @Post()
  async create(@Body() dto: CreateRecurringDto) {
    try {
      return await this.recurring.create(dto);
    } catch (error: any) {
      console.error('Error creating recurring task:', error?.message || error);
      throw new HttpException(
        error?.message || 'Failed to create recurring task',
        error?.status || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get()
  async list(@Query('active') active?: string) {
    try {
      const activeBool = typeof active === 'string' ? active === 'true' : undefined;
      return await this.recurring.list(activeBool);
    } catch (error: any) {
      console.error('Error listing recurring tasks:', error?.message || error);
      throw new HttpException(
        error?.message || 'Failed to list recurring tasks',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get(':id')
  async get(@Param('id') id: string) {
    try {
      return await this.recurring.get(id);
    } catch (error: any) {
      console.error('Error fetching recurring task:', error?.message || error);
      throw new HttpException(
        error?.message || 'Failed to fetch recurring task',
        error?.status || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateRecurringDto) {
    try {
      return await this.recurring.update(id, dto);
    } catch (error: any) {
      console.error('Error updating recurring task:', error?.message || error);
      throw new HttpException(
        error?.message || 'Failed to update recurring task',
        error?.status || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post(':id/pause')
  async pause(@Param('id') id: string) {
    try {
      return await this.recurring.pause(id);
    } catch (error: any) {
      console.error('Error pausing recurring task:', error?.message || error);
      throw new HttpException(
        error?.message || 'Failed to pause recurring task',
        error?.status || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post(':id/resume')
  async resume(@Param('id') id: string) {
    try {
      return await this.recurring.resume(id);
    } catch (error: any) {
      console.error('Error resuming recurring task:', error?.message || error);
      throw new HttpException(
        error?.message || 'Failed to resume recurring task',
        error?.status || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    try {
      return await this.recurring.remove(id);
    } catch (error: any) {
      console.error('Error deleting recurring task:', error?.message || error);
      throw new HttpException(
        error?.message || 'Failed to delete recurring task',
        error?.status || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
