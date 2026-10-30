import { Component, EventEmitter, OnInit, Output, inject, signal } from '@angular/core';
import { forkJoin } from 'rxjs';
import QRCode from 'qrcode';
import { ApiService } from '../core/api.service';
import { UiIconComponent } from '../ui/icon.component';

interface Info { name: string; slug: string; logoUrl: string | null; primaryColor: string; secondaryColor: string; }

/**
 * "Link y QR": el link personalizado del negocio y su código QR,
 * listos para copiar, compartir, descargar o imprimir como afiche.
 */
@Component({
  selector: 'app-share-link',
  standalone: true,
  imports: [UiIconComponent],
  template: `
    @if (info(); as i) {
      <div class="share-layout">
        <section class="card form-stack" aria-labelledby="share-link-title">
          <div class="panel-head"><div><h3 id="share-link-title">Tu link para reservas</h3><p class="muted">Cualquier persona con este link llega directo a tu página para pedir turno.</p></div></div>
          <div class="link-box">
            <app-ui-icon name="link" />
            <a class="link-url" [href]="url()" target="_blank" rel="noopener noreferrer">{{ displayUrl() }}</a>
            <button type="button" class="btn btn-primary btn-sm" (click)="copy()"><app-ui-icon name="copy" /> {{ copied() ? '¡Copiado!' : 'Copiar' }}</button>
          </div>
          <div class="share-buttons">
            <a class="btn btn-secondary" [href]="whatsappShare()" target="_blank" rel="noopener noreferrer"><app-ui-icon name="whatsapp" /> Enviar por WhatsApp</a>
            <button type="button" class="btn btn-secondary" (click)="nativeShare()"><app-ui-icon name="share" /> Compartir</button>
            <a class="btn btn-secondary" [href]="url()" target="_blank" rel="noopener noreferrer"><app-ui-icon name="external" /> Abrir mi página</a>
          </div>
          <div class="tip-box">
            <app-ui-icon name="sparkles" />
            <p><strong>Ideas para usarlo:</strong> ponlo en la biografía de Instagram, en tu estado de WhatsApp, en Google Maps y en tus mensajes de respuesta automática.</p>
          </div>
          <button type="button" class="btn-link" (click)="editLink.emit()"><app-ui-icon name="settings" /> Cambiar mi link</button>
        </section>

        <section class="card qr-card" aria-labelledby="share-qr-title">
          <h3 id="share-qr-title">Código QR</h3>
          <p class="muted">Para tu vitrina, mostrador, tarjetas o volantes.</p>
          @if (qr()) { <img class="qr-big" [src]="qr()" [alt]="'Código QR que abre ' + displayUrl()" /> }
          @else { <div class="loading-state"><span class="spinner"></span> Generando QR…</div> }
          <div class="share-buttons">
            <button type="button" class="btn btn-primary" (click)="downloadQr()" [disabled]="!qr()"><app-ui-icon name="download" /> Descargar QR</button>
            <button type="button" class="btn btn-secondary" (click)="downloadPoster()" [disabled]="busyPoster()"><app-ui-icon name="printer" /> {{ busyPoster() ? 'Preparando…' : 'Afiche para imprimir' }}</button>
          </div>
        </section>
      </div>
    } @else {
      @if (error()) { <p class="error" role="alert">{{ error() }}</p> }
      @else { <div class="loading-state" role="status"><span class="spinner" aria-hidden="true"></span> Cargando…</div> }
    }
  `,
})
export class ShareLinkComponent implements OnInit {
  private api = inject(ApiService);
  @Output() editLink = new EventEmitter<void>();
  @Output() notify = new EventEmitter<{ message: string; type: 'ok' | 'error' }>();

  info = signal<Info | null>(null);
  qr = signal('');
  copied = signal(false);
  busyPoster = signal(false);
  error = signal('');

  ngOnInit(): void {
    forkJoin({
      p: this.api.get<{ name: string; slug: string }>('/tenant/profile'),
      b: this.api.get<{ logoUrl: string | null; primaryColor: string; secondaryColor: string }>('/tenant/branding'),
    }).subscribe({
      next: ({ p, b }) => {
        this.info.set({ name: p.name, slug: p.slug, logoUrl: b.logoUrl, primaryColor: b.primaryColor, secondaryColor: b.secondaryColor });
        void this.renderQr();
      },
      error: () => this.error.set('No se pudo cargar tu link.'),
    });
  }

  url(): string { return `${location.origin}/${this.info()?.slug ?? ''}`; }
  displayUrl(): string { return `${location.host}/${this.info()?.slug ?? ''}`; }

  whatsappShare(): string {
    const text = `¡Hola! Ahora puedes pedir tu turno en ${this.info()?.name} aquí: ${this.url()}`;
    return `https://wa.me/?text=${encodeURIComponent(text)}`;
  }

  async copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.url());
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 2000);
    } catch {
      this.notify.emit({ message: 'No se pudo copiar. Selecciona el link y cópialo manualmente.', type: 'error' });
    }
  }

  async nativeShare(): Promise<void> {
    const i = this.info();
    if (!i) return;
    if (navigator.share) {
      try { await navigator.share({ title: i.name, text: `Pide tu turno en ${i.name}`, url: this.url() }); } catch { /* cancelado */ }
    } else {
      await this.copy();
    }
  }

  private async renderQr(): Promise<void> {
    this.qr.set(await QRCode.toDataURL(this.url(), { width: 720, margin: 2, errorCorrectionLevel: 'M', color: { dark: '#0f172a', light: '#ffffff' } }));
  }

  downloadQr(): void {
    this.download(this.qr(), `qr-${this.info()?.slug}.png`);
  }

  /** Afiche tamaño carta (1275×1650 px) con nombre, QR y link, listo para imprimir. */
  async downloadPoster(): Promise<void> {
    const i = this.info();
    if (!i) return;
    this.busyPoster.set(true);
    try {
      const W = 1275, H = 1650;
      const canvas = document.createElement('canvas');
      canvas.width = W; canvas.height = H;
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, W, H);
      const grad = ctx.createLinearGradient(0, 0, W, 420);
      grad.addColorStop(0, i.primaryColor);
      grad.addColorStop(1, i.secondaryColor);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, W, 420);

      let titleY = 250;
      if (i.logoUrl) {
        try {
          const logo = await this.loadImage(i.logoUrl);
          const size = 200;
          ctx.fillStyle = '#ffffff';
          this.roundRect(ctx, W / 2 - size / 2 - 16, 120, size + 32, size + 32, 36);
          ctx.fill();
          const s = Math.min(size / logo.width, size / logo.height);
          ctx.drawImage(logo, W / 2 - (logo.width * s) / 2, 136 + (size - logo.height * s) / 2, logo.width * s, logo.height * s);
          titleY = 520;
        } catch { /* sin logo */ }
      }
      ctx.textAlign = 'center';
      ctx.fillStyle = titleY > 420 ? '#0f172a' : '#ffffff';
      ctx.font = '800 76px Inter, system-ui, sans-serif';
      ctx.fillText(this.fit(ctx, i.name, W - 160), W / 2, titleY);

      ctx.fillStyle = '#0f172a';
      ctx.font = '700 58px Inter, system-ui, sans-serif';
      ctx.fillText('Escanea y pide tu turno', W / 2, titleY > 420 ? 640 : 560);

      const qrImg = await this.loadImage(this.qr());
      const qrSize = 760;
      const qrY = titleY > 420 ? 690 : 620;
      ctx.drawImage(qrImg, (W - qrSize) / 2, qrY, qrSize, qrSize);

      ctx.fillStyle = '#334155';
      ctx.font = '600 44px Inter, system-ui, sans-serif';
      ctx.fillText(this.displayUrl(), W / 2, qrY + qrSize + 80);
      this.download(canvas.toDataURL('image/png'), `afiche-${i.slug}.png`);
    } catch {
      this.notify.emit({ message: 'No se pudo generar el afiche.', type: 'error' });
    } finally {
      this.busyPoster.set(false);
    }
  }

  private fit(ctx: CanvasRenderingContext2D, text: string, max: number): string {
    let t = text;
    while (ctx.measureText(t).width > max && t.length > 4) t = t.slice(0, -2);
    return t === text ? t : t.trimEnd() + '…';
  }

  private roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  private loadImage(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });
  }

  private download(href: string, filename: string): void {
    const a = document.createElement('a');
    a.href = href;
    a.download = filename;
    a.click();
  }
}
