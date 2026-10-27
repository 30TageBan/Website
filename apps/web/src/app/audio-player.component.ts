import {
  AfterViewInit,
  Component,
  ElementRef,
  Input,
  OnDestroy,
  ViewChild,
  signal,
} from '@angular/core';

@Component({
  selector: 'app-audio-player',
  template: ` <section class="music-player">
    <audio
      #audio
      [src]="url"
      preload="metadata"
      (loadedmetadata)="duration.set(audio.duration)"
      (timeupdate)="position.set(audio.currentTime)"
      (play)="playing.set(true); message.set('')"
      (pause)="playing.set(false)"
      (error)="message.set('Audiodatei konnte nicht geladen werden.')"
    ></audio>
    <div class="music-title">
      <strong>{{ title || 'Meine Musik' }}</strong
      ><span>{{ time(position()) }} / {{ time(duration()) }}</span>
    </div>
    <label class="sr-only" [for]="'audio-seek'">Wiedergabeposition</label
    ><input
      id="audio-seek"
      class="music-seek"
      type="range"
      min="0"
      [max]="duration() || 1"
      [value]="position()"
      (input)="seek($event)"
      aria-label="Wiedergabeposition"
    />
    <div class="music-controls">
      <button
        (click)="toggle()"
        [attr.aria-label]="playing() ? 'Musik pausieren' : 'Musik abspielen'"
      >
        {{ playing() ? 'Ⅱ' : '▶' }}
      </button>
      <span aria-hidden="true">♪</span
      ><input
        type="range"
        min="0"
        max="1"
        step="0.01"
        [value]="volume"
        (input)="setVolume($event)"
        aria-label="Lautstärke"
      />
    </div>
    @if (message()) {
      <p class="muted small" role="status">{{ message() }}</p>
    }
  </section>`,
})
export class AudioPlayerComponent implements AfterViewInit, OnDestroy {
  @Input({ required: true }) url = '';
  @Input() title = '';
  @Input() autoplay = false;
  @ViewChild('audio', { static: true }) audio!: ElementRef<HTMLAudioElement>;
  playing = signal(false);
  position = signal(0);
  duration = signal(0);
  message = signal('');
  volume = 0.5;

  ngAfterViewInit() {
    this.audio.nativeElement.volume = this.volume;
    if (this.autoplay) void this.play();
  }

  async play() {
    try {
      await this.audio.nativeElement.play();
    } catch {
      this.message.set('Zum Starten bitte auf Play klicken.');
    }
  }

  toggle() {
    if (this.playing()) this.audio.nativeElement.pause();
    else void this.play();
  }

  seek(event: Event) {
    this.audio.nativeElement.currentTime = Number((event.target as HTMLInputElement).value);
  }

  setVolume(event: Event) {
    this.volume = Number((event.target as HTMLInputElement).value);
    this.audio.nativeElement.volume = this.volume;
  }

  time(value: number) {
    if (!Number.isFinite(value)) return '0:00';
    const seconds = Math.floor(value);
    return Math.floor(seconds / 60) + ':' + String(seconds % 60).padStart(2, '0');
  }

  ngOnDestroy() {
    this.audio.nativeElement.pause();
  }
}
