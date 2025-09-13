import { Controller, Get, Query, Res } from '@nestjs/common';
import { CalendarService } from './calendar.service';
import { Response } from 'express';

@Controller('google')
export class CalendarController {
  constructor(private readonly calendarService: CalendarService) {}

  @Get('oauth/start')
  startOAuth(@Res() res: Response) {
    const url = this.calendarService.getAuthUrl();
    return res.redirect(url);
  }

  @Get('oauth/callback')
  async oauthCallback(@Query('code') code: string, @Res() res: Response) {
    if (!code) {
      return res.status(400).send('Missing code');
    }
    await this.calendarService.handleOAuthCallback(code);
    // Show a simple success page to avoid 404 on '/'
    return res
      .status(200)
      .send(
        '<html><body style="font-family:sans-serif; padding:24px">' +
          '<h2>Google OAuth successful</h2>' +
          '<p>Tokens saved. You can close this tab and return to FamiliarBot.</p>' +
        '</body></html>'
      );
  }

  @Get('oauth/status')
  async oauthStatus(@Res() res: Response) {
    const ok = this.calendarService.isAuthorized();
    return res.status(200).json({ authorized: ok });
  }

  // Current agent time with timezone awareness
  @Get('time')
  async getTime(@Res() res: Response) {
    return res.status(200).json({ now: this.calendarService.nowISO() });
  }

  // Convenience: list this week's events using AGENT_TIMEZONE
  @Get('week')
  async listThisWeek(
    @Query('maxResults') maxResults: string | undefined,
    @Query('q') q: string | undefined,
    @Query('calendarId') calendarId: string | undefined,
    @Res() res: Response,
  ) {
    const items = await this.calendarService.listEventsThisWeek({
      maxResults: maxResults ? Number(maxResults) : undefined,
      q,
      calendarId,
    });
    return res.status(200).json({ items });
  }
}
