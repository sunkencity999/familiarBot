import { Controller, Get, Post, Body, HttpException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Controller('clipboard')
export class ClipboardController {
  private readonly desktopBase: string;
  constructor(config: ConfigService) {
    this.desktopBase = config.get<string>('BYTEBOT_DESKTOP_BASE_URL') || '';
  }

  @Get()
  async getClipboard() {
    const res = await fetch(`${this.desktopBase}/computer-use`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'get_clipboard' }),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new HttpException(body || 'Clipboard read failed', res.status);
    }
    return res.json();
  }

  @Post()
  async setClipboard(@Body() body: { text: string }) {
    const res = await fetch(`${this.desktopBase}/computer-use`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'set_clipboard', text: body.text }),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new HttpException(body || 'Clipboard set failed', res.status);
    }
    return res.json();
  }
}
