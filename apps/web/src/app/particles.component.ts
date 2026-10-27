import {
  AfterViewInit,
  Component,
  ElementRef,
  Input,
  OnChanges,
  OnDestroy,
  ViewChild,
} from '@angular/core';
interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  phase: number;
}
@Component({
  selector: 'app-particles',
  template: '<canvas #canvas class="scene-particles" aria-hidden="true"></canvas>',
})
export class ParticlesComponent implements AfterViewInit, OnChanges, OnDestroy {
  @Input() mode = 'particles';
  @Input() color = '#a78bfa';
  @Input() speed = 'normal';
  @Input() density = 'normal';
  @Input() interactive = true;
  @ViewChild('canvas', { static: true }) canvas!: ElementRef<HTMLCanvasElement>;
  private ctx: CanvasRenderingContext2D | null = null;
  private frame = 0;
  private last = 0;
  private elapsed = 0;
  private width = 0;
  private height = 0;
  private points: Particle[] = [];
  private pointer = { x: -1000, y: -1000 };
  private reduced = matchMedia('(prefers-reduced-motion:reduce)');
  private fine = matchMedia('(pointer:fine)');
  private cleanup: (() => void)[] = [];
  private observer?: ResizeObserver;
  ngAfterViewInit() {
    this.ctx = this.canvas.nativeElement.getContext('2d');
    if (!this.ctx) return;
    const listen = (target: EventTarget, event: string, fn: EventListener) => {
      target.addEventListener(event, fn, { passive: true });
      this.cleanup.push(() => target.removeEventListener(event, fn));
    };
    listen(document, 'visibilitychange', () => {
      cancelAnimationFrame(this.frame);
      this.frame = 0;
      this.last = 0;
      if (!document.hidden) this.wake();
    });
    listen(this.reduced, 'change', () => {
      cancelAnimationFrame(this.frame);
      this.frame = 0;
      this.wake();
    });
    listen(document, 'pointermove', ((e: PointerEvent) => {
      if (
        e.pointerType === 'touch' ||
        !this.interactive ||
        !this.fine.matches ||
        this.reduced.matches
      )
        return;
      this.pointer = { x: e.clientX, y: e.clientY };
    }) as EventListener);
    listen(document, 'pointerleave', () => (this.pointer = { x: -1000, y: -1000 }));
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(this.canvas.nativeElement);
    this.resize();
  }
  ngOnChanges() {
    if (this.ctx) {
      this.seed();
      this.wake();
    }
  }
  private resize() {
    const canvas = this.canvas.nativeElement,
      r = canvas.getBoundingClientRect();
    this.width = r.width;
    this.height = r.height;
    const ratio = Math.min(devicePixelRatio || 1, 1.5);
    canvas.width = Math.round(r.width * ratio);
    canvas.height = Math.round(r.height * ratio);
    this.ctx?.setTransform(ratio, 0, 0, ratio, 0, 0);
    this.seed();
    this.wake();
  }
  private seed() {
    const multiplier = this.density === 'low' ? 0.55 : this.density === 'high' ? 1.45 : 1;
    const count = Math.min(
      125,
      Math.max(16, Math.round(((this.width * this.height) / 22000) * multiplier)),
    );
    this.points = Array.from({ length: count }, () => ({
      x: Math.random() * this.width,
      y: Math.random() * this.height,
      vx: (Math.random() - 0.5) * 20,
      vy: (Math.random() - 0.5) * 20,
      r: 1 + Math.random() * 2.4,
      phase: Math.random() * Math.PI * 2,
    }));
  }
  private wake() {
    if (!this.frame && !document.hidden) this.frame = requestAnimationFrame(this.render);
  }
  private render = (now: number) => {
    this.frame = 0;
    if (document.hidden || !this.ctx) return;
    if (this.last && now - this.last < 32) {
      this.wake();
      return;
    }
    const dt =
      Math.min((now - this.last) / 1000 || 0.032, 0.065) *
      (this.speed === 'slow' ? 0.45 : this.speed === 'fast' ? 1.8 : 1);
    this.last = now;
    this.elapsed += dt;
    const ctx = this.ctx,
      w = this.width,
      h = this.height;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = this.color;
    ctx.strokeStyle = this.color;
    const moving = !this.reduced.matches;
    for (const p of this.points) {
      if (moving) {
        if (this.mode === 'embers') {
          p.x += Math.sin(this.elapsed + p.phase) * dt * 12;
          p.y -= dt * (12 + p.r * 6);
        } else if (this.mode === 'bubbles') {
          p.y -= dt * (5 + p.r * 3);
          p.x += Math.sin(this.elapsed * 0.6 + p.phase) * dt * 5;
        } else if (this.mode === 'meteors') {
          p.x += dt * (65 + p.r * 25);
          p.y += dt * (35 + p.r * 15);
        } else {
          p.x += p.vx * dt;
          p.y += p.vy * dt;
        }
        if (p.x > w + 40) p.x = -35;
        if (p.x < -40) p.x = w + 35;
        if (p.y > h + 40) p.y = -35;
        if (p.y < -40) p.y = h + 35;
      }
      ctx.globalAlpha =
        this.mode === 'constellation' ? 0.45 + Math.sin(this.elapsed + p.phase) * 0.3 : 0.65;
      ctx.beginPath();
      if (this.mode === 'bubbles') {
        ctx.arc(p.x, p.y, p.r * 7, 0, Math.PI * 2);
        ctx.lineWidth = 0.8;
        ctx.stroke();
      } else if (this.mode === 'meteors') {
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - 25 * p.r, p.y - 14 * p.r);
        ctx.lineWidth = p.r * 0.5;
        ctx.stroke();
      } else {
        ctx.arc(p.x, p.y, this.mode === 'embers' ? p.r * 1.4 : p.r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    if (this.mode === 'particles' || this.mode === 'constellation') {
      const distance = this.mode === 'constellation' ? 110 : 155;
      for (let i = 0; i < this.points.length; i++)
        for (let j = i + 1; j < this.points.length; j++) {
          const a = this.points[i],
            b = this.points[j],
            d = Math.hypot(a.x - b.x, a.y - b.y);
          if (d > distance) continue;
          ctx.globalAlpha = (1 - d / distance) * 0.32;
          ctx.lineWidth = 0.65;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
      if (this.interactive && moving && this.fine.matches)
        for (const p of this.points) {
          const d = Math.hypot(p.x - this.pointer.x, p.y - this.pointer.y);
          if (d > 180) continue;
          ctx.globalAlpha = (1 - d / 180) * 0.65;
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(this.pointer.x, this.pointer.y);
          ctx.stroke();
        }
    }
    ctx.globalAlpha = 1;
    if (moving) this.wake();
  };
  ngOnDestroy() {
    cancelAnimationFrame(this.frame);
    this.observer?.disconnect();
    this.cleanup.forEach((fn) => fn());
  }
}
