import { Component, Input, OnChanges, OnDestroy, signal } from '@angular/core';

@Component({
  selector: 'app-animated-title',
  template: `<h1
    [attr.aria-label]="text"
    [class]="'animated-title title-' + effect"
    [style.--title-accent]="accent"
  >
    <span [class.typewriter-visible]="effect === 'typewriter'" aria-hidden="true">{{
      effect === 'typewriter' ? visible() : text
    }}</span>
    @if (effect === 'typewriter') {
      <span class="typewriter-mirror" aria-hidden="true">{{ text }}</span>
    }
  </h1>`,
})
export class AnimatedTitleComponent implements OnChanges, OnDestroy {
  @Input() text = '';
  @Input() effect = 'none';
  @Input() accent = '#a78bfa';
  visible = signal('');
  private timer?: ReturnType<typeof setInterval>;
  private query?: MediaQueryList;
  private reduced = () => this.animate();

  ngOnChanges() {
    if (!this.query) {
      this.query = matchMedia('(prefers-reduced-motion:reduce)');
      this.query.addEventListener('change', this.reduced);
    }
    this.animate();
  }

  private animate() {
    clearInterval(this.timer);
    this.visible.set(this.text);
    if (this.effect !== 'typewriter' || this.query?.matches) return;
    const chars = Array.from(this.text);
    let index = 0;
    this.visible.set('');
    this.timer = setInterval(() => {
      index++;
      this.visible.set(chars.slice(0, Math.min(index, chars.length)).join(''));
      if (index > chars.length + 14) index = 0;
    }, 110);
  }

  ngOnDestroy() {
    clearInterval(this.timer);
    this.query?.removeEventListener('change', this.reduced);
  }
}
