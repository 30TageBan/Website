import { Directive, DestroyRef, HostListener, inject, NgZone } from '@angular/core';
import { Router } from '@angular/router';

/** Public-page interaction restrictions; browser overrides remain possible. */
@Directive({
  selector: '[appContentProtection]',
  host: { '[class.public-content]': 'isPublicPage()' },
})
export class ContentProtectionDirective {
  private router = inject(Router);

  isPublicPage() {
    const path = this.router.url.split(/[?#]/)[0];
    return !/^\/(admin|login|setup)(\/|$)/.test(path);
  }

  private isEditable(target: EventTarget | null) {
    return (
      target instanceof Element &&
      !!target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])')
    );
  }

  @HostListener('document:contextmenu', ['$event'])
  @HostListener('document:selectstart', ['$event'])
  preventContentInteraction(event: Event) {
    if (this.isPublicPage() && !this.isEditable(event.target)) event.preventDefault();
  }

  @HostListener('document:pointerdown', ['$event'])
  @HostListener('document:mousedown', ['$event'])
  @HostListener('document:mouseup', ['$event'])
  @HostListener('document:auxclick', ['$event'])
  preventRightButton(event: MouseEvent) {
    if (event.button === 2 && this.isPublicPage() && !this.isEditable(event.target)) {
      event.preventDefault();
    }
  }

  @HostListener('document:dragstart', ['$event'])
  preventImageDrag(event: DragEvent) {
    if (this.isPublicPage() && event.target instanceof Element && event.target.closest('img')) {
      event.preventDefault();
    }
  }

  @HostListener('document:keydown', ['$event'])
  preventInspectorShortcut(event: KeyboardEvent) {
    if (!this.isPublicPage() || this.isEditable(event.target)) return;
    const key = event.key.toLowerCase();
    if (
      key === 'f12' ||
      (event.ctrlKey && event.shiftKey && ['i', 'j', 'c'].includes(key)) ||
      (event.metaKey && event.altKey && ['i', 'j', 'c'].includes(key))
    ) {
      event.preventDefault();
    }
  }

  constructor() {
    const destroyRef = inject(DestroyRef);
    inject(NgZone).runOutsideAngular(() => {
      // Intentional debugger pauses on public pages; the browser can disable these pauses.
      const timer = setInterval(() => {
        if (this.isPublicPage() && document.visibilityState === 'visible') {
          debugger;
        }
      }, 1000);
      destroyRef.onDestroy(() => clearInterval(timer));
    });
  }
}
