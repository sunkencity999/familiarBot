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

  private async callDesktop<T = any>(action: string, payload: Record<string, unknown>): Promise<{ ok: boolean; status: number; body: T | string }> {
    const res = await fetch(`${this.desktopBase}/computer-use`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, ...payload }),
    });
    const text = await res.text();
    let body: any = text;
    try { body = text ? JSON.parse(text) : {}; } catch { /* keep text */ }
    return { ok: res.ok, status: res.status, body };
  }

  private isSuccess(body: any): boolean {
    if (body && typeof body === 'object' && 'success' in body) return !!body.success;
    return true; // if endpoint doesn't set success flag, assume HTTP status indicates success
  }

  @Get('list')
  async list(@Query('path') path?: string) {
    const res = await this.callDesktop('list_dir', { path });
    if (!res.ok) throw new HttpException(typeof res.body === 'string' ? res.body : 'List dir failed', res.status);
    return res.body;
  }

  @Get('download')
  async download(@Query('path') path: string) {
    if (!path) throw new HttpException('path required', HttpStatus.BAD_REQUEST);
    const res = await this.callDesktop('read_file', { path });
    if (!res.ok) throw new HttpException(typeof res.body === 'string' ? res.body : 'Read file failed', res.status);
    return res.body;
  }

  @Post('upload')
  async upload(@Body() body: { path: string; data: string }) {
    const res = await this.callDesktop('write_file', { path: body.path, data: body.data });
    if (!res.ok) throw new HttpException(typeof res.body === 'string' ? res.body : 'Write file failed', res.status);
    return res.body;
  }

  @Post('mkdir')
  async mkdir(@Body() body: { path: string }) {
    const res = await this.callDesktop('make_dir', { path: body.path });
    if (!res.ok) throw new HttpException(typeof res.body === 'string' ? res.body : 'Make dir failed', res.status);
    return res.body;
  }

  @Delete()
  async delete(@Query('path') path: string) {
    if (!path) throw new HttpException('path required', HttpStatus.BAD_REQUEST);
    const attempt = await this.callDesktop('delete_path', { path });
    if (attempt.ok) {
      // Some desktop endpoints return { success: boolean, error?: string }
      const body = attempt.body as any;
      const hasSuccess = body && typeof body === 'object' && 'success' in body;
      if (!hasSuccess || body.success === true) {
        // Verify deletion actually took effect. If still present, try Trash fallback (seen on Desktop dir)
        const parent = this.dirname(path);
        const name = this.basename(path);
        const stillExists = await this.exists(parent, name);
        if (!stillExists) return { success: true };
        // Move to trash as a fallback
        const trashed = await this.moveToTrash(path);
        if (trashed) return { success: true };
        throw new HttpException('Delete reported success but file still present and Trash fallback failed', HttpStatus.INTERNAL_SERVER_ERROR);
      }
      // If success explicitly false, continue to error handling / fallback
    }

    // Fallback: recursive delete if directory not empty or similar error
    const text = typeof attempt.body === 'string' ? attempt.body : JSON.stringify(attempt.body);
    const likelyDirError = /not empty|is a directory|directory/i.test(text);
    if (!likelyDirError) {
      // If desktop returned structured error, surface it; otherwise generic
      const body = attempt.body as any;
      const message = body && typeof body === 'object' && typeof body.error === 'string' ? body.error : (text || 'Delete failed');
      throw new HttpException(message, attempt.status || HttpStatus.BAD_REQUEST);
    }

    await this.recursiveDelete(path);
    // Try delete once more after children removed
    const finalTry = await this.callDesktop('delete_path', { path });
    const finalBody = typeof finalTry.body === 'string' ? undefined : (finalTry.body as any);
    if (!finalTry.ok || (finalBody && this.isSuccess(finalBody) === false)) {
      const msg = finalBody?.error || (typeof finalTry.body === 'string' ? finalTry.body : 'Recursive delete failed');
      throw new HttpException(msg, finalTry.status || HttpStatus.INTERNAL_SERVER_ERROR);
    }
    // Verify directory gone
    const parent = this.dirname(path);
    const name = this.basename(path);
    const stillExists = await this.exists(parent, name);
    if (!stillExists) return { success: true };
    throw new HttpException('Recursive delete reported success but directory still present', HttpStatus.INTERNAL_SERVER_ERROR);
  }

  @Post('move')
  async move(@Body() body: { from: string; to: string }) {
    const res = await this.callDesktop('move_path', { from: body.from, to: body.to });
    if (!res.ok) throw new HttpException(typeof res.body === 'string' ? res.body : 'Move failed', res.status);
    return res.body;
  }

  private async recursiveDelete(path: string): Promise<void> {
    // list directory
    const list = await this.callDesktop<{ path: string; entries: { name: string; type: 'file'|'dir' }[] }>('list_dir', { path });
    if (!list.ok || (typeof list.body !== 'string' && this.isSuccess(list.body) === false)) throw new HttpException(typeof list.body === 'string' ? list.body : 'List dir failed during recursive delete', list.status);
    const entries = (list.body as any).entries as { name: string; type: 'file'|'dir' }[];
    for (const entry of entries) {
      const child = `${path.replace(/\/$/, '')}/${entry.name}`;
      if (entry.type === 'dir') {
        await this.recursiveDelete(child);
        const delDir = await this.callDesktop('delete_path', { path: child });
        if (!delDir.ok || (typeof delDir.body !== 'string' && this.isSuccess(delDir.body) === false)) throw new HttpException(typeof delDir.body === 'string' ? delDir.body : 'Failed to delete subdir', delDir.status);
      } else {
        const delFile = await this.callDesktop('delete_path', { path: child });
        if (!delFile.ok || (typeof delFile.body !== 'string' && this.isSuccess(delFile.body) === false)) throw new HttpException(typeof delFile.body === 'string' ? delFile.body : 'Failed to delete file', delFile.status);
      }
    }
  }

  private basename(p: string): string {
    const s = p.replace(/\/$/, '');
    const i = s.lastIndexOf('/');
    return i >= 0 ? s.slice(i + 1) : s;
  }

  private dirname(p: string): string {
    const s = p.replace(/\/$/, '');
    const i = s.lastIndexOf('/');
    return i > 0 ? s.slice(0, i) : '/';
  }

  private async exists(dir: string, name: string): Promise<boolean> {
    const list = await this.callDesktop<{ path: string; entries: { name: string }[] }>('list_dir', { path: dir });
    if (!list.ok || (typeof list.body !== 'string' && this.isSuccess(list.body) === false)) return false;
    const entries = (list.body as any).entries as { name: string }[];
    return entries?.some(e => e.name === name) || false;
  }

  private async moveToTrash(path: string): Promise<boolean> {
    // Create ~/.Trash if needed and move the file there
    const home = '/home/user';
    const trash = `${home}/.Trash`;
    const ensure = await this.callDesktop('make_dir', { path: trash });
    // make_dir may fail if already exists; ignore non-2xx here
    const name = `${this.basename(path)}.${Date.now()}`;
    const to = `${trash}/${name}`;
    const moved = await this.callDesktop('move_path', { from: path, to });
    if (!moved.ok) return false;
    if (typeof moved.body !== 'string' && this.isSuccess(moved.body) === false) return false;
    return true;
  }
}
