import { ErrorHandler, Injectable, inject } from '@angular/core';
import { ApiService } from './api.service';

@Injectable()
export class WebsiteErrorHandler implements ErrorHandler {
  private api = inject(ApiService);
  private lastReported = 0;

  handleError(error: unknown) {
    console.error(error);
    const now = Date.now();
    if (now - this.lastReported < 30000) return;
    this.lastReported = now;
    let path = location.pathname;
    if (path.startsWith('/f/')) path = '/f/[key]';
    else if (path.startsWith('/go/')) path = '/go/[key]';
    // Only report the category and normalized route. Error text may contain private inputs.
    void this.api.send('POST', '/events/error', { path }).catch(() => {});
  }
}
