import { Component, Input } from '@angular/core';
import { ParticlesComponent } from './particles.component';
import { Portfolio } from './models';
import { profileContent } from '../../../../shared/portfolio';

@Component({
  selector: 'app-scene',
  imports: [ParticlesComponent],
  template: ` <div
    [class]="'scene bg-' + (portfolio?.backgroundPreset || 'default')"
    [style.--scene-accent]="settings.accent"
    [style.--scene-duration]="duration"
    aria-hidden="true"
  >
    @if (settings.mediaUrl && settings.mediaType === 'image') {
      <img class="scene-media" [src]="settings.mediaUrl" alt="" />
    }
    @if (settings.mediaUrl && settings.mediaType === 'video') {
      <video
        class="scene-media"
        [src]="settings.mediaUrl"
        autoplay
        loop
        muted
        playsinline
        [muted]="true"
      ></video>
    }
    <div
      class="scene-blur"
      [style.backdrop-filter]="'blur(' + (portfolio?.backgroundSettings?.blur ?? 18) + 'px)'"
    ></div>
    @if (canvasModes.has(settings.animation)) {
      <app-particles
        [mode]="settings.animation"
        [color]="settings.accent"
        [speed]="settings.speed"
        [density]="settings.density || 'normal'"
        [interactive]="settings.interactive !== false"
      />
    } @else {
      <div [class]="'scene-motion motion-' + settings.animation"></div>
    }
    <div
      class="scene-shade"
      [style.background]="
        'rgba(0,0,0,' + (portfolio?.backgroundSettings?.overlayOpacity ?? 0.55) + ')'
      "
      [style.box-shadow]="
        'inset 0 0 220px rgba(0,0,0,' + (portfolio?.backgroundSettings?.vignette ?? 0.35) + ')'
      "
    ></div>
  </div>`,
})
export class SceneComponent {
  canvasModes = new Set(['particles', 'constellation', 'bubbles', 'embers', 'meteors']);
  @Input() portfolio: Portfolio | null = null;
  get settings() {
    return profileContent(this.portfolio?.content).appearance;
  }
  get duration() {
    return this.settings.speed === 'slow' ? '36s' : this.settings.speed === 'fast' ? '9s' : '20s';
  }
}
