import {
  Component,
  Injectable,
  ViewChild,
  ElementRef,
  AfterViewInit,
  effect,
  inject,
  signal,
} from '@angular/core';
import { safeButtonUrl } from '../../../../shared/portfolio';

@Injectable({ providedIn: 'root' })
export class ExternalLinks {
  pending = signal<{ url: string; host: string; newTab: boolean } | null>(null);
  skip = signal(false);
  constructor() {
    try {
      this.skip.set(localStorage.getItem('cg_skip_external_warning') === 'true');
    } catch {}
  }
  request(event: MouseEvent, url: string, newTab = false) {
    if (!safeButtonUrl(url)) {
      event.preventDefault();
      return;
    }
    const target = new URL(url, location.href);
    if (target.origin === location.origin || this.skip()) return;
    if (event.button > 1) return;
    event.preventDefault();
    this.pending.set({
      url: target.href,
      host: target.host,
      newTab: newTab || event.ctrlKey || event.metaKey || event.shiftKey || event.button === 1,
    });
  }
  confirm(skip: boolean) {
    const target = this.pending();
    if (!target) return;
    this.pending.set(null);
    if (skip) {
      this.skip.set(true);
      try {
        localStorage.setItem('cg_skip_external_warning', 'true');
      } catch {}
    }
    if (target.newTab) window.open(target.url, '_blank', 'noopener,noreferrer');
    else location.assign(target.url);
  }
  reset() {
    this.skip.set(false);
    try {
      localStorage.removeItem('cg_skip_external_warning');
    } catch {}
  }
}
@Component({
  selector: 'app-external-dialog',
  template: ` <dialog
    #dialog
    class="external-dialog"
    aria-labelledby="external-title"
    aria-describedby="external-description"
    (cancel)="cancel($event)"
  >
    <form (submit)="$event.preventDefault()">
      <div class="warning-mark" aria-hidden="true">!</div>
      <h2 id="external-title">Website verlassen?</h2>
      <p id="external-description" class="muted">Möchtest du diesen externen Link öffnen?</p>
      <strong class="external-host">{{ links.pending()?.host }}</strong>
      <div class="external-actions">
        <button type="button" class="confirm-open" (click)="links.confirm(remember.checked)">
          <span aria-hidden="true">✓</span>Link öffnen</button
        ><button type="button" class="cancel-open" autofocus (click)="links.pending.set(null)">
          <span aria-hidden="true">×</span>Abbrechen
        </button>
      </div>
      <label class="checkbox"><input #remember type="checkbox" />Nicht erneut fragen</label>
    </form>
  </dialog>`,
})
export class ExternalLinkDialog implements AfterViewInit {
  links = inject(ExternalLinks);
  @ViewChild('remember', { static: true }) remember!: ElementRef<HTMLInputElement>;
  @ViewChild('dialog', { static: true }) dialog!: ElementRef<HTMLDialogElement>;
  constructor() {
    effect(() => {
      const pending = this.links.pending();
      const el = this.dialog?.nativeElement;
      if (!el) return;
      if (pending && !el.open) {
        this.remember.nativeElement.checked = false;
        el.showModal();
      } else if (!pending && el.open) el.close();
    });
  }
  ngAfterViewInit() {
    if (this.links.pending()) this.dialog.nativeElement.showModal();
  }
  cancel(event: Event) {
    event.preventDefault();
    this.links.pending.set(null);
  }
}
