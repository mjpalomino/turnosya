import { beforeEach, describe, expect, it } from 'vitest';
import { ThemeService } from './theme.service';

describe('ThemeService / tenant customization', () => {
  let theme: ThemeService;

  beforeEach(() => {
    theme = new ThemeService();
    theme.reset();
  });

  it('applies a tenant palette while keeping button text legible on light colors', () => {
    theme.apply('#ffdd33', '#ff8800');
    const root = document.documentElement.style;
    expect(root.getPropertyValue('--brand-primary')).toBe('#ffdd33');
    expect(root.getPropertyValue('--brand-secondary')).toBe('#ff8800');
    expect(root.getPropertyValue('--brand-primary-contrast')).toBe('#000000');
    expect(root.getPropertyValue('--brand-ink')).not.toBe('#ffdd33');
  });

  it('uses white foreground on dark brands and clears all overrides when leaving the site', () => {
    theme.apply('#172554', '#1e40af');
    expect(document.documentElement.style.getPropertyValue('--brand-primary-contrast')).toBe('#ffffff');
    theme.reset();
    for (const name of ['--brand-primary', '--brand-secondary', '--brand-primary-contrast', '--brand-ink']) {
      expect(document.documentElement.style.getPropertyValue(name)).toBe('');
    }
  });
});

describe('ThemeService / platform palette', () => {
  it('restores the platform palette (not the CSS default) after leaving a business page', () => {
    const theme = new ThemeService();
    theme.setPlatform('#0f766e', '#115e59');
    theme.apply('#ffdd33', '#ff8800');
    expect(document.documentElement.style.getPropertyValue('--brand-primary')).toBe('#ffdd33');
    theme.reset();
    expect(document.documentElement.style.getPropertyValue('--brand-primary')).toBe('#0f766e');
    expect(document.documentElement.style.getPropertyValue('--brand-secondary')).toBe('#115e59');
    theme.setPlatform(null);
    expect(document.documentElement.style.getPropertyValue('--brand-primary')).toBe('');
  });
});
