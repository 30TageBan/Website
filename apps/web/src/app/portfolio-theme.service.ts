import { DOCUMENT } from '@angular/common';
import { effect, inject, Injectable, signal } from '@angular/core';
import { Portfolio } from './models';

@Injectable({ providedIn: 'root' })
export class PortfolioThemeService {
  portfolio = signal<Portfolio | null>(null);

  private document = inject(DOCUMENT);

  constructor() {
    effect(() => {
      const avatar = this.portfolio()?.avatarUrl;
      const existing = this.document.head.querySelector<HTMLLinkElement>('link[data-profile-icon]');
      if (!avatar) {
        existing?.remove();
        return;
      }

      const icon = existing || this.document.createElement('link');
      icon.rel = 'icon';
      icon.dataset['profileIcon'] = '';
      // Keep the original URL so Discord avatars and uploaded images work without canvas/CORS.
      icon.href = avatar;
      if (!existing) this.document.head.appendChild(icon);
    });
  }
}
