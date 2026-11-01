import { describe, expect, it } from 'vitest';
import { detectInstallKind } from './install.service';

const UA = {
  iosSafari: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  iosChrome: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0.6478.54 Mobile/15E148 Safari/604.1',
  androidChrome: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36',
  samsung: 'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0.0.0 Mobile Safari/537.36',
  winChrome: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  winEdge: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 Edg/126.0.0.0',
  macSafari: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
  firefoxDesktop: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0',
  instagram: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 330.0',
};

describe('detectInstallKind', () => {
  it('distingue Safari y Chrome en iPhone', () => {
    expect(detectInstallKind(UA.iosSafari)).toBe('ios-safari');
    expect(detectInstallKind(UA.iosChrome)).toBe('ios-other');
  });
  it('Android: Chrome y Samsung Internet', () => {
    expect(detectInstallKind(UA.androidChrome)).toBe('android-chrome');
    expect(detectInstallKind(UA.samsung)).toBe('android-samsung');
  });
  it('escritorio: Chrome, Edge, Safari y Firefox', () => {
    expect(detectInstallKind(UA.winChrome)).toBe('desktop-chrome');
    expect(detectInstallKind(UA.winEdge)).toBe('desktop-edge');
    expect(detectInstallKind(UA.macSafari)).toBe('mac-safari');
    expect(detectInstallKind(UA.firefoxDesktop)).toBe('none');
  });
  it('iPad que se presenta como Mac', () => {
    expect(detectInstallKind(UA.macSafari, 'MacIntel', 5)).toBe('ios-safari');
  });
  it('navegador interno de redes sociales', () => {
    expect(detectInstallKind(UA.instagram)).toBe('in-app');
  });
});
