import { Injectable, NgZone, PLATFORM_ID, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { ToastService } from './toast.service';

/** Lo mínimo de la Web Speech API que se usa (no está en lib.dom para todos los navegadores). */
interface Recognition {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
}
type RecognitionCtor = new () => Recognition;

/**
 * Dictado REAL con el reconocimiento de voz del navegador (es-AR). Si el
 * navegador no lo tiene, `supported` es false y no se ofrece: nunca se
 * simula escribiendo un texto de ejemplo.
 */
@Injectable({ providedIn: 'root' })
export class SpeechInput {
  private readonly zone = inject(NgZone);
  private readonly toast = inject(ToastService);
  private readonly ctor: RecognitionCtor | null = isPlatformBrowser(inject(PLATFORM_ID))
    ? ((window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor })
        .SpeechRecognition ??
      (window as unknown as { webkitSpeechRecognition?: RecognitionCtor }).webkitSpeechRecognition ??
      null)
    : null;

  readonly supported = signal(!!this.ctor);
  readonly listening = signal(false);
  private current: Recognition | null = null;

  /**
   * Empieza a escuchar. `onText` recibe el texto completo dictado hasta el
   * momento, a continuación de `prefix` (lo que ya estaba escrito).
   */
  start(prefix: string, onText: (text: string) => void): void {
    if (!this.ctor || this.listening()) return;
    const rec = new this.ctor();
    rec.lang = 'es-AR';
    rec.interimResults = true;
    rec.continuous = false;
    const base = prefix.trim() ? prefix.trim() + ' ' : '';
    rec.onresult = (e) =>
      this.zone.run(() => {
        let said = '';
        for (let i = 0; i < e.results.length; i++) said += e.results[i][0].transcript;
        onText(base + said.trim());
      });
    rec.onerror = (e) =>
      this.zone.run(() => {
        if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
          this.toast.show('Para dictar, permití el uso del micrófono en tu navegador.', 4000);
        } else if (e.error !== 'aborted' && e.error !== 'no-speech') {
          this.toast.show('No pudimos escucharte. Probá de nuevo o escribilo.', 4000);
        }
      });
    rec.onend = () => this.zone.run(() => this.listening.set(false));
    this.current = rec;
    this.listening.set(true);
    try {
      rec.start();
    } catch {
      this.listening.set(false);
    }
  }

  stop(): void {
    this.current?.stop();
  }

  toggle(prefix: string, onText: (text: string) => void): void {
    if (this.listening()) this.stop();
    else this.start(prefix, onText);
  }
}
