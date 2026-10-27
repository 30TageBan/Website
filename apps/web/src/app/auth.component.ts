import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ApiService } from './api.service';
import { Provisioning } from './models';

@Component({
  selector: 'app-auth',
  imports: [FormsModule, RouterLink],
  template: ` <main class="auth-page">
    <section class="panel auth-panel">
      <a routerLink="/" class="wordmark">chris-g<span>.dev</span></a>
      <h1>{{ setup ? 'Admin einrichten' : 'Willkommen zurück' }}</h1>
      <p class="muted">
        {{
          setup
            ? 'Lege deinen persönlichen Adminzugang an.'
            : 'Melde dich an, um deine Website zu verwalten.'
        }}
      </p>
      <form (ngSubmit)="submit()" #form="ngForm">
        <label
          >Passwort<input
            type="password"
            name="password"
            [(ngModel)]="password"
            required
            [minlength]="setup ? 8 : 1"
            maxlength="128"
            [autocomplete]="setup ? 'new-password' : 'current-password'"
        /></label>
        @if (setup) {
          <label class="checkbox"
            ><input
              type="checkbox"
              name="enableTotp"
              [(ngModel)]="enableTotp"
              (ngModelChange)="toggleTotp()"
            />2FA mit Authenticator aktivieren</label
          >
          @if (enableTotp) {
            @if (provision()) {
              <div class="totp-setup">
                <img
                  [src]="provision()!.qrDataUrl"
                  alt="QR-Code für den Authenticator"
                  width="180"
                  height="180"
                /><code>{{ provision()!.base32 }}</code>
              </div>
            } @else {
              <p role="status">QR-Code wird geladen…</p>
            }
            <label
              >Erster 2FA-Code<input
                name="firstTotp"
                [(ngModel)]="totp"
                inputmode="numeric"
                autocomplete="one-time-code"
                required
            /></label>
          }
        } @else {
          <label
            >2FA-Code (falls aktiv)<input
              name="totp"
              [(ngModel)]="totp"
              inputmode="numeric"
              autocomplete="one-time-code"
          /></label>
        }
        @if (error()) {
          <p class="error" role="alert">{{ error() }}</p>
        }
        <button
          class="primary full"
          [disabled]="busy() || form.invalid || (enableTotp && !provision())"
        >
          {{ busy() ? 'Bitte warten…' : setup ? 'Setup abschließen' : 'Anmelden' }}
        </button>
      </form>
    </section>
  </main>`,
})
export class AuthComponent implements OnInit {
  api = inject(ApiService);
  route = inject(ActivatedRoute);
  router = inject(Router);
  setup = false;
  password = '';
  totp = '';
  enableTotp = false;
  provision = signal<Provisioning | null>(null);
  busy = signal(false);
  error = signal('');

  ngOnInit() {
    this.setup = this.route.snapshot.routeConfig?.path === 'setup';
  }

  async toggleTotp() {
    if (!this.enableTotp || this.provision()) return;
    try {
      this.provision.set(await this.api.send<Provisioning>('POST', '/auth/setup/totp', {}));
    } catch (error) {
      this.error.set(this.api.message(error));
    }
  }

  async submit() {
    this.busy.set(true);
    this.error.set('');
    try {
      await this.api.refreshAuth();
      await this.api.send(
        'POST',
        this.setup ? '/auth/setup' : '/auth/login',
        this.setup
          ? {
              password: this.password,
              enableTotp: this.enableTotp,
              totpSecret: this.provision()?.base32 || '',
              firstTotp: this.totp,
            }
          : { password: this.password, totp: this.totp },
      );
      await this.api.refreshAuth();
      await this.router.navigateByUrl('/admin');
    } catch (error) {
      this.error.set(this.api.message(error));
    } finally {
      this.busy.set(false);
    }
  }
}
