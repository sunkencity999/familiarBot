import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { google, calendar_v3 } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import * as fs from 'fs';
import { promises as fsp } from 'fs';
// Use CommonJS require to avoid interop issues with path default import
// eslint-disable-next-line @typescript-eslint/no-var-requires
const path = require('path');
import { DateTime } from 'luxon';

@Injectable()
export class CalendarService {
  private readonly logger = new Logger(CalendarService.name);
  private oauth2Client: OAuth2Client;
  private tokenPath: string;

  constructor(private readonly configService: ConfigService) {
    const clientId = this.configService.get<string>('GOOGLE_CLIENT_ID');
    const clientSecret = this.configService.get<string>('GOOGLE_CLIENT_SECRET');
    const redirectUri = this.configService.get<string>('GOOGLE_OAUTH_REDIRECT') || 'http://localhost:9991/api/google/oauth/callback';

    if (!clientId || !clientSecret) {
      this.logger.warn('GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET not set; Google Calendar features will be disabled.');
    }

    this.oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
    this.tokenPath = this.configService.get<string>('GOOGLE_TOKEN_PATH') || '/data/google_tokens.json';

    // Attempt to load tokens on startup if present
    try {
      if (fs.existsSync(this.tokenPath)) {
        const tokens = JSON.parse(fs.readFileSync(this.tokenPath, 'utf-8'));
        this.oauth2Client.setCredentials(tokens);
      }
    } catch (err) {
      this.logger.error('Failed to load Google tokens', (err as Error).stack);
    }
  }

  getAuthUrl(): string {
    const scopes = (this.configService.get<string>('GOOGLE_SCOPES') || 'https://www.googleapis.com/auth/calendar').split(',');
    return this.oauth2Client.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      scope: scopes,
    });
  }

  async handleOAuthCallback(code: string): Promise<void> {
    const { tokens } = await this.oauth2Client.getToken(code);
    this.oauth2Client.setCredentials(tokens);
    await fsp.mkdir(path.dirname(this.tokenPath), { recursive: true });
    await fsp.writeFile(this.tokenPath, JSON.stringify(tokens, null, 2), 'utf-8');
  }

  private calendar(): calendar_v3.Calendar {
    return google.calendar({ version: 'v3', auth: this.oauth2Client });
  }

  private timezone(): string {
    return (
      this.configService.get<string>('AGENT_TIMEZONE') ||
      process.env.TZ ||
      'UTC'
    );
  }

  nowISO(): string {
    return DateTime.now().setZone(this.timezone()).toISO()!;
  }

  currentWeekRange(): { timeMin: string; timeMax: string } {
    const now = DateTime.now().setZone(this.timezone());
    const start = now.startOf('week');
    const end = now.endOf('week');
    return { timeMin: start.toISO()!, timeMax: end.toISO()! };
  }

  async listEvents(params: { timeMin?: string; timeMax?: string; maxResults?: number; q?: string; calendarId?: string }): Promise<calendar_v3.Schema$Event[]> {
    const calId = params.calendarId || 'primary';
    const res = await this.calendar().events.list({
      calendarId: calId,
      timeMin: params.timeMin,
      timeMax: params.timeMax,
      maxResults: params.maxResults ?? 50,
      singleEvents: true,
      orderBy: 'startTime',
      q: params.q,
    });
    return res.data.items || [];
  }

  async listEventsThisWeek(params?: { maxResults?: number; q?: string; calendarId?: string }): Promise<calendar_v3.Schema$Event[]> {
    const { timeMin, timeMax } = this.currentWeekRange();
    return this.listEvents({
      timeMin,
      timeMax,
      maxResults: params?.maxResults,
      q: params?.q,
      calendarId: params?.calendarId,
    });
  }

  async createEvent(input: {
    summary: string;
    description?: string;
    location?: string;
    start: { dateTime?: string; date?: string; timeZone?: string };
    end: { dateTime?: string; date?: string; timeZone?: string };
    attendees?: { email: string }[];
    reminders?: { useDefault?: boolean; overrides?: { method: 'email' | 'popup'; minutes: number }[] };
    calendarId?: string;
  }): Promise<calendar_v3.Schema$Event> {
    const calId = input.calendarId || 'primary';
    const res = await this.calendar().events.insert({
      calendarId: calId,
      requestBody: {
        summary: input.summary,
        description: input.description,
        location: input.location,
        start: input.start,
        end: input.end,
        attendees: input.attendees,
        reminders: input.reminders,
      },
    });
    return res.data;
  }

  isAuthorized(): boolean {
    const creds = this.oauth2Client.credentials as any;
    return Boolean(creds && (creds.access_token || creds.refresh_token));
  }
}
