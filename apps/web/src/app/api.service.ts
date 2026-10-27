import { Injectable, inject, signal } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class ApiService {
  private http = inject(HttpClient);
  auth = signal({ loggedIn: false, setupComplete: true });
  available = signal(true);

  async refreshAuth() {
    try {
      this.auth.set(await this.get<{ loggedIn: boolean; setupComplete: boolean }>('/auth/status'));
      this.available.set(true);
    } catch (error) {
      this.available.set(false);
      throw error;
    }
  }

  get<T>(url: string) {
    return firstValueFrom(this.http.get<T>('/api' + url));
  }

  send<T = { ok: boolean }>(method: string, url: string, body?: unknown) {
    return firstValueFrom(this.http.request<T>(method, '/api' + url, { body }));
  }

  message(error: unknown) {
    return error instanceof HttpErrorResponse
      ? error.error?.error ||
          (error.status === 0
            ? 'API nicht erreichbar. Bitte Verbindung prüfen.'
            : 'Anfrage fehlgeschlagen.')
      : 'Ein Fehler ist aufgetreten.';
  }
}
