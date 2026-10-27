import {
  Directive,
  ElementRef,
  HostListener,
  Input,
  OnChanges,
  OnDestroy,
  inject,
} from '@angular/core';
import { viewportMotion } from '../../../../shared/motion';

/** Both surfaces follow pointer coordinates across the entire 100vw × 100vh viewport. */
@Directive({ selector: '[appMotionSurface]' })
export class MotionSurfaceDirective implements OnChanges, OnDestroy {
  @Input() appMotionSurface: 'entry' | 'card' = 'card';
  @Input() motionLevel = 'lively';

  private host = inject(ElementRef<HTMLElement>).nativeElement;
  private reduced = matchMedia('(prefers-reduced-motion:reduce)');
  private fine = matchMedia('(pointer:fine)');
  private frame = 0;
  private pending: { x: number; y: number } | null = null;
  private resetOnPreference = () => this.reset();

  constructor() {
    this.reduced.addEventListener('change', this.resetOnPreference);
    this.fine.addEventListener('change', this.resetOnPreference);
  }

  ngOnChanges() {
    if (this.motionLevel === 'none') this.reset();
  }

  @HostListener('document:pointermove', ['$event'])
  move(event: PointerEvent) {
    if (
      event.pointerType === 'touch' ||
      this.reduced.matches ||
      !this.fine.matches ||
      this.motionLevel === 'none'
    ) {
      return;
    }

    this.pending = { x: event.clientX, y: event.clientY };
    if (this.frame) return;

    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      if (!this.pending) return;

      const variables = viewportMotion(
        this.pending.x,
        this.pending.y,
        window.innerWidth,
        window.innerHeight,
        this.appMotionSurface,
        this.motionLevel,
      );

      for (const [key, value] of Object.entries(variables)) {
        this.host.style.setProperty(key, value);
      }
      this.host.classList.add('pointer-active');
    });
  }

  @HostListener('document:pointerleave')
  @HostListener('document:pointercancel')
  @HostListener('window:blur')
  @HostListener('window:resize')
  reset() {
    cancelAnimationFrame(this.frame);
    this.frame = 0;
    this.pending = null;
    this.host.classList.remove('pointer-active');

    for (const key of [
      '--move-x',
      '--move-y',
      '--tilt-x',
      '--tilt-y',
      '--pointer-x',
      '--pointer-y',
    ]) {
      this.host.style.removeProperty(key);
    }
  }

  ngOnDestroy() {
    this.reset();
    this.reduced.removeEventListener('change', this.resetOnPreference);
    this.fine.removeEventListener('change', this.resetOnPreference);
  }
}
