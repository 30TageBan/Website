import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ApiService } from './api.service';
import { Provisioning } from './models';

@Component({
  selector: 'app-security',
  imports: [FormsModule],
  template: `
    <header class="page-heading">
      <span class="eyebrow">Dein Zugang</span>
      <h1>Sicherheit</h1>
      <p class="muted">Passwort und Zwei-Faktor-Authentifizierung verwalten.</p>
    </header>
    @if (error()) {
      <p class="error" role="alert">{{ error() }}</p>
    }
    @if (notice()) {
      <p class="notice" role="status">{{ notice() }}</p>
    }
    @if (loading()) {
      <p role="status">Einstellungen werden geladen…</p>
    } @else {
      <form class="panel" (ngSubmit)="changePassword()" #passwordForm="ngForm">
        <h2>Passwort ändern</h2>
        <p class="muted">Nach der Änderung werden alle Sitzungen abgemeldet.</p>
        <div class="form-grid">
          <label
            >Aktuelles Passwort<input
              type="password"
              name="currentPassword"
              [(ngModel)]="currentPassword"
              autocomplete="current-password"
              required /></label
          ><label
            >Neues Passwort (mindestens 8 Zeichen)<input
              type="password"
              name="newPassword"
              [(ngModel)]="newPassword"
              minlength="8"
              maxlength="128"
              autocomplete="new-password"
              required
          /></label>
        </div>
        <button class="primary" [disabled]="busy() || passwordForm.invalid">Passwort ändern</button>
      </form>
      <section class="panel">
        <h2>
          Zwei-Faktor-Authentifizierung
          <span class="badge" [class.enabled]="enabled()">{{
            enabled() ? 'Aktiv' : 'Nicht aktiv'
          }}</span>
        </h2>
        @if (!enabled()) {
          <p class="muted">
            Schütze die Anmeldung zusätzlich mit einem Code aus deiner Authenticator-App.
          </p>
          @if (!provision()) {
            <button [disabled]="busy()" (click)="begin()">2FA einrichten</button>
          } @else {
            <div class="totp-setup">
              <img
                [src]="provision()!.qrDataUrl"
                alt="QR-Code für den Authenticator"
                width="180"
                height="180"
              /><code>{{ provision()!.base32 }}</code>
            </div>
            <form (ngSubmit)="enable()" #enableForm="ngForm">
              <label
                >Code bestätigen<input
                  name="token"
                  [(ngModel)]="token"
                  inputmode="numeric"
                  autocomplete="one-time-code"
                  required /></label
              ><button class="primary" [disabled]="busy() || enableForm.invalid">
                2FA aktivieren
              </button>
            </form>
          }
        } @else {
          <form (ngSubmit)="disable()" #disableForm="ngForm">
            <div class="form-grid">
              <label
                >Passwort<input
                  type="password"
                  name="password"
                  [(ngModel)]="disablePassword"
                  autocomplete="current-password"
                  required /></label
              ><label
                >Aktueller 2FA-Code<input
                  name="token"
                  [(ngModel)]="token"
                  inputmode="numeric"
                  autocomplete="one-time-code"
                  required
              /></label>
            </div>
            <button class="danger" [disabled]="busy() || disableForm.invalid">
              2FA deaktivieren
            </button>
          </form>
        }
      </section>
    }
  `,
})
export class SecurityComponent implements OnInit {
  api = inject(ApiService);
  router = inject(Router);
  enabled = signal(false);
  loading = signal(true);
  busy = signal(false);
  error = signal('');
  notice = signal('');
  provision = signal<Provisioning | null>(null);
  currentPassword = '';
  newPassword = '';
  disablePassword = '';
  token = '';
  ngOnInit() {
    void this.load();
  }
  async load() {
    try {
      this.enabled.set(
        (await this.api.get<{ totpEnabled: boolean }>('/admin/security')).totpEnabled,
      );
    } catch (error) {
      this.error.set(this.api.message(error));
    } finally {
      this.loading.set(false);
    }
  }
  async run(action: () => Promise<unknown>, notice = '') {
    this.busy.set(true);
    this.error.set('');
    this.notice.set('');
    try {
      await action();
      this.notice.set(notice);
    } catch (error) {
      this.error.set(this.api.message(error));
    } finally {
      this.busy.set(false);
    }
  }
  changePassword() {
    return this.run(async () => {
      await this.api.send('POST', '/admin/security/password', {
        currentPassword: this.currentPassword,
        newPassword: this.newPassword,
      });
      await this.api.refreshAuth();
      await this.router.navigateByUrl('/login');
    });
  }
  begin() {
    return this.run(async () =>
      this.provision.set(
        await this.api.send<Provisioning>('POST', '/admin/security/totp/begin', {}),
      ),
    );
  }
  enable() {
    return this.run(async () => {
      await this.api.send('POST', '/admin/security/totp/enable', {
        secretBase32: this.provision()!.base32,
        token: this.token,
      });
      this.provision.set(null);
      this.token = '';
      await this.load();
    }, '2FA ist aktiviert.');
  }
  disable() {
    return this.run(async () => {
      await this.api.send('POST', '/admin/security/totp/disable', {
        password: this.disablePassword,
        token: this.token,
      });
      this.disablePassword = '';
      this.token = '';
      await this.load();
    }, '2FA ist deaktiviert.');
  }
}
