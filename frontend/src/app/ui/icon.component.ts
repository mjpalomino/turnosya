import { ChangeDetectionStrategy, Component, Input } from '@angular/core';

/** Lightweight, consistent outline icon set. Decorative by default; text provides the accessible label. */
@Component({
  selector: 'app-ui-icon',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="20" height="20"
         fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"
         stroke-linejoin="round" aria-hidden="true" focusable="false">
      @switch (name) {
        @case ('calendar') { <rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4M17 3v4M3 10h18M8 14h3M8 17h6"/> }
        @case ('calendar-check') { <rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4M17 3v4M3 10h18m-12 5 2 2 4-4"/> }
        @case ('clock') { <circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/> }
        @case ('users') { <path d="M16 20v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 10a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM22 20v-2a4 4 0 0 0-3-3.87M16 2.13a4 4 0 0 1 0 7.75"/> }
        @case ('briefcase') { <rect x="3" y="7" width="18" height="14" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 12h18"/> }
        @case ('chart') { <path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/> }
        @case ('layers') { <rect x="3" y="3" width="18" height="18" rx="3"/><path d="M8 8h8M8 12h8M8 16h5"/> }
        @case ('gift') { <rect x="3" y="9" width="18" height="12" rx="2"/><path d="M12 9v12M3 13h18M12 9H8a3 3 0 1 1 3-3l1 3ZM12 9h4a3 3 0 1 0-3-3l-1 3Z"/> }
        @case ('credit-card') { <rect x="2" y="5" width="20" height="14" rx="3"/><path d="M2 10h20M6 15h4"/> }
        @case ('palette') { <path d="M12 3a9 9 0 1 0 0 18h1a2 2 0 0 0 1.6-3.2 2 2 0 0 1 1.6-3.2H18a3 3 0 0 0 3-3C21 6.86 16.97 3 12 3Z"/><circle cx="7.5" cy="11.5" r="1"/><circle cx="9.5" cy="7.5" r="1"/><circle cx="15" cy="7.5" r="1"/> }
        @case ('settings') { <path d="M10 3h4l.7 2.1 2 .9 2.1-.8 2 3.5-1.6 1.6.1 2.2 1.5 1.6-2 3.5-2.1-.8-2 .9L14 21h-4l-.7-2.1-2-.9-2.1.8-2-3.5 1.6-1.6-.1-2.2-1.5-1.6 2-3.5 2.1.8 2-.9L10 3Z"/><circle cx="12" cy="12" r="3"/> }
        @case ('logout') { <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/> }
        @case ('arrow-right') { <path d="M5 12h14M13 6l6 6-6 6"/> }
        @case ('arrow-left') { <path d="M19 12H5m6 6-6-6 6-6"/> }
        @case ('chevron-right') { <path d="m9 18 6-6-6-6"/> }
        @case ('check') { <path d="m5 12 4 4L19 6"/> }
        @case ('check-circle') { <circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/> }
        @case ('shield') { <path d="M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11Z"/><path d="m9 12 2 2 4-4"/> }
        @case ('sparkles') { <path d="m12 3 1.6 5.4L19 10l-5.4 1.6L12 17l-1.6-5.4L5 10l5.4-1.6L12 3ZM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8L19 16Z"/> }
        @case ('plus') { <path d="M12 5v14M5 12h14"/> }
        @case ('search') { <circle cx="10.5" cy="10.5" r="7.5"/><path d="m16 16 5 5"/> }
        @case ('mail') { <rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/> }
        @case ('lock') { <rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3"/> }
        @case ('star') { <path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9L12 3Z"/> }
        @case ('phone') { <path d="M7 3H5a2 2 0 0 0-2 2c0 9 7 16 16 16a2 2 0 0 0 2-2v-2l-5-2-2 3a16 16 0 0 1-8-8l3-2-2-5Z"/> }
        @case ('map-pin') { <path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/> }
        @case ('info') { <circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/> }
        @case ('alert') { <path d="m12 3 10 18H2L12 3Z"/><path d="M12 9v5M12 17h.01"/> }
        @case ('external') { <path d="M14 3h7v7M21 3l-10 10"/><path d="M20 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h6"/> }
        @case ('store') { <path d="M3 10V5h18v5l-2 3H5l-2-3ZM5 13v8h14v-8M9 21v-6h6v6M3 10h18"/> }
        @case ('scissors') { <circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M20 4 8.1 15.9M14.5 14.5 20 20M8.1 8.1 12 12"/> }
        @case ('hand') { <path d="M18 11V6a2 2 0 0 0-4 0v5M14 10V4a2 2 0 0 0-4 0v6M10 10.5V6a2 2 0 0 0-4 0v8"/><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"/> }
        @case ('leaf') { <path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z"/><path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12"/> }
        @case ('stethoscope') { <path d="M5 3v6a5 5 0 0 0 10 0V3M5 3H3m2 0h2M15 3h-2m2 0h2M10 14v2a5 5 0 0 0 10 0v-2"/><circle cx="20" cy="12" r="2"/> }
        @case ('smile') { <circle cx="12" cy="12" r="9"/><path d="M8 14s1.5 2 4 2 4-2 4-2M9 9h.01M15 9h.01"/> }
        @case ('paw') { <circle cx="11" cy="4" r="2"/><circle cx="18" cy="8" r="2"/><circle cx="20" cy="16" r="2"/><path d="M9 10a5 5 0 0 1 5 5v3.5a3.5 3.5 0 0 1-6.84 1.05Q6.52 17.48 4.46 16.84A3.5 3.5 0 0 1 5.5 10Z"/> }
        @case ('dumbbell') { <path d="M14.4 14.4 9.6 9.6M18.66 21.51a2 2 0 1 1-2.83-2.83l-1.77 1.77a2 2 0 1 1-2.83-2.83l6.37-6.36a2 2 0 1 1 2.83 2.82l-1.77 1.77a2 2 0 1 1 2.83 2.83ZM21.5 21.5l-1.4-1.4M3.9 3.9 2.5 2.5M6.4 12.77a2 2 0 1 1-2.83-2.83l1.77-1.77a2 2 0 1 1-2.82-2.83l2.83-2.83a2 2 0 1 1 2.83 2.83l1.77-1.77a2 2 0 1 1 2.83 2.83Z"/> }
        @case ('wrench') { <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76Z"/> }
        @case ('download') { <path d="M12 3v12m-5-5 5 5 5-5M5 21h14"/> }
        @case ('locate') { <circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2.5"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/> }
        @case ('copy') { <rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1"/> }
        @case ('link') { <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/> }
        @case ('qr') { <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3h-3zM20 14v.01M14 20h.01M17 20h4v-3"/> }
        @case ('upload') { <path d="M12 16V4m-5 5 5-5 5 5M5 20h14"/> }
        @case ('image') { <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21"/> }
        @case ('globe') { <circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/> }
        @case ('instagram') { <rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><path d="M17.5 6.5h.01"/> }
        @case ('smartphone') { <rect x="6" y="2" width="12" height="20" rx="2.5"/><path d="M11 18h2"/> }
        @case ('x') { <path d="M18 6 6 18M6 6l12 12"/> }
        @case ('share') { <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4"/> }
        @case ('printer') { <path d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/> }
        @case ('eye') { <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/> }
        @case ('trash') { <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/> }
        @case ('user') { <circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/> }
        @case ('compass') { <circle cx="12" cy="12" r="9"/><path d="m15.5 8.5-2 5-5 2 2-5 5-2Z"/> }
        @case ('whatsapp') { <path d="M3 21l1.65-4.3A8.5 8.5 0 1 1 8 20l-5 1Z"/><path d="M9 9.5c0 3 2.5 5.5 5.5 5.5l1.2-1.4-1.9-.9-.8.8c-1-.4-2.1-1.5-2.5-2.5l.8-.8-.9-1.9L9 9.5Z"/> }
        @case ('filter') { <path d="M3 5h18l-7 8v6l-4 2v-8L3 5Z"/> }
        @case ('menu') { <path d="M4 7h16M4 12h16M4 17h16"/> }
      }
    </svg>
  `,
})
export class UiIconComponent {
  @Input({ required: true }) name = 'calendar';
}
