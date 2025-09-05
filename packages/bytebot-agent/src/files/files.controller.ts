import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Query,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Controller('files')
export class FilesController {
  private readonly desktopBase: string;

  constructor(config: ConfigService) {
    this.desktopBase = config.get<string>('BYTEBOT_DESKTOP_BASE_URL') || '';
  }

  @Get('list')
  async list(@Query('path') path?: string) {
    const res = await fetch(`${this.desktopBase}/computer-use`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'list_dir', path }),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new HttpException(body || 'List dir failed', res.status);
    }
    return res.json();
  }

  @Get('download')
  async download(@Query('path') path: string) {
    if (!path) throw new HttpException('path required', HttpStatus.BAD_REQUEST);
    const res = await fetch(`${this.desktopBase}/computer-use`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'read_file', path }),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new HttpException(body || 'Read file failed', res.status);
    }
    return res.json();
  }

  @Post('upload')
  async upload(@Body() body: { path: string; data: string }) {
    const res = await fetch(`${this.desktopBase}/computer-use`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'write_file', path: body.path, data: body.data }),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new HttpException(body || 'Write file failed', res.status);
    }
    return res.json();
  }

  @Post('mkdir')
  async mkdir(@Body() body: { path: string }) {
    const res = await fetch(`${this.desktopBase}/computer-use`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'make_dir', path: body.path }),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new HttpException(body || 'Make dir failed', res.status);
    }
    return res.json();
  }

  @Delete()
  async delete(@Query('path') path: string) {
    const res = await fetch(`${this.desktopBase}/computer-use`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'delete_path', path }),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new HttpException(body || 'Delete failed', res.status);
    }
    return res.json();
  }

  @Post('move')
  async move(@Body() body: { from: string; to: string }) {
    const res = await fetch(`${this.desktopBase}/computer-use`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'move_path', from: body.from, to: body.to }),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new HttpException(body || 'Move failed', res.status);
    }
    return res.json();
  }
}
