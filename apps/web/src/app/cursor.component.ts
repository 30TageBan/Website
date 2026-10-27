import { AfterViewInit, Component, ElementRef, Input, OnDestroy, ViewChild } from '@angular/core';

interface Particle {
  x: number;
  y: number;
  age: number;
  vx: number;
  vy: number;
}
@Component({
  selector: 'app-cursor',
  template: '<canvas #canvas class="cursor-canvas" aria-hidden="true"></canvas>',
})
export class CursorComponent implements AfterViewInit, OnDestroy {
  @Input() mode = 'none';
  @Input() color = '#a78bfa';
  @ViewChild('canvas', { static: true }) canvas!: ElementRef<HTMLCanvasElement>;
  private frame = 0;
  private cleanup: (() => void)[] = [];
  private particles: Particle[] = [];
  ngAfterViewInit() {
    const canvas = this.canvas.nativeElement,
      ctx = canvas.getContext('2d');
    if (!ctx) return;
    const fine = matchMedia('(pointer:fine)'),
      reduced = matchMedia('(prefers-reduced-motion:reduce)');
    let x = -1000,
      y = -1000,
      rx = x,
      ry = y,
      last = 0,
      active = false;
    const resize = () => {
      const ratio = Math.min(devicePixelRatio || 1, 2);
      canvas.width = innerWidth * ratio;
      canvas.height = innerHeight * ratio;
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    };
    const listen = (target: EventTarget, event: string, handler: EventListener) => {
      target.addEventListener(event, handler, { passive: true });
      this.cleanup.push(() => target.removeEventListener(event, handler));
    };
    const render = (time: number) => {
      this.frame = 0;
      const dt = Math.min((time - last) / 1000 || 0.016, 0.05);
      last = time;
      ctx.clearRect(0, 0, innerWidth, innerHeight);
      if (this.mode === 'none' || !fine.matches || reduced.matches || document.hidden) {
        this.particles = [];
        return;
      }
      ctx.strokeStyle = this.color;
      ctx.fillStyle = this.color;
      if (active && this.mode === 'glow') {
        const gradient = ctx.createRadialGradient(x, y, 0, x, y, 85);
        gradient.addColorStop(0, this.color + '35');
        gradient.addColorStop(1, this.color + '00');
        ctx.fillStyle = gradient;
        ctx.fillRect(x - 85, y - 85, 170, 170);
      }
      if (active && this.mode === 'ring') {
        const follow = 1 - Math.exp(-18 * dt);
        rx += (x - rx) * follow;
        ry += (y - ry) * follow;
        ctx.globalAlpha = 0.8;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(rx, ry, 16, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
      this.particles = this.particles.filter((p) => p.age < 0.8);
      for (const p of this.particles) {
        p.age += dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        ctx.globalAlpha = Math.max(0, 1 - p.age / 0.8);
        ctx.beginPath();
        if (this.mode === 'ripple') {
          ctx.arc(p.x, p.y, 8 + p.age * 70, 0, Math.PI * 2);
          ctx.lineWidth = 1.5;
          ctx.stroke();
        } else if (this.mode === 'sparkles') {
          const r = 4 * (1 - p.age / 0.8);
          ctx.moveTo(p.x - r, p.y);
          ctx.lineTo(p.x + r, p.y);
          ctx.moveTo(p.x, p.y - r);
          ctx.lineTo(p.x, p.y + r);
          ctx.stroke();
        } else {
          ctx.arc(p.x, p.y, Math.max(0.1, 3 * (1 - p.age / 0.8)), 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.globalAlpha = 1;
      if (
        (active && this.mode === 'ring' && Math.hypot(x - rx, y - ry) > 0.1) ||
        this.particles.length
      )
        this.frame = requestAnimationFrame(render);
    };
    const wake = () => {
      if (!this.frame) this.frame = requestAnimationFrame(render);
    };
    listen(window, 'resize', resize);
    listen(document, 'pointermove', ((event: PointerEvent) => {
      if (event.pointerType === 'touch') return;
      if (!active) {
        rx = event.clientX;
        ry = event.clientY;
      }
      active = true;
      x = event.clientX;
      y = event.clientY;
      if (this.mode === 'trail' || this.mode === 'sparkles')
        this.particles.push({
          x,
          y,
          age: 0,
          vx: (Math.random() - 0.5) * 30,
          vy: (Math.random() - 0.5) * 30,
        });
      if (this.particles.length > 90) this.particles.splice(0, this.particles.length - 90);
      wake();
    }) as EventListener);
    listen(document, 'pointerdown', ((event: PointerEvent) => {
      if (this.mode === 'ripple' && event.pointerType !== 'touch') {
        this.particles.push({ x: event.clientX, y: event.clientY, age: 0, vx: 0, vy: 0 });
        wake();
      }
    }) as EventListener);
    listen(document, 'pointerleave', () => {
      active = false;
      wake();
    });
    listen(document, 'visibilitychange', wake);
    listen(reduced, 'change', wake);
    listen(fine, 'change', wake);
    resize();
  }
  ngOnDestroy() {
    cancelAnimationFrame(this.frame);
    this.cleanup.forEach((fn) => fn());
  }
}
