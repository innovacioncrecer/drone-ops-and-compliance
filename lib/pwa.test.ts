import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';
import manifest from '../app/manifest';

describe('PWA installability', () => {
  it('defines a scoped standalone app with required PNG icons', () => {
    const result = manifest();
    expect(result).toMatchObject({ id: '/', start_url: '/', scope: '/', display: 'standalone', lang: 'es' });
    expect(result.icons).toEqual(expect.arrayContaining([
      expect.objectContaining({ sizes: '192x192', type: 'image/png' }),
      expect.objectContaining({ sizes: '512x512', type: 'image/png' }),
    ]));
  });

  it('caches only the offline page and never intercepts API or media requests', async () => {
    const handlers: Record<string, (event: any) => void> = {};
    const add = vi.fn().mockResolvedValue(undefined);
    const caches = { open: vi.fn().mockResolvedValue({ add }), match: vi.fn().mockResolvedValue('offline') };
    const fetch = vi.fn().mockRejectedValue(new Error('offline'));
    runInNewContext(readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8'), {
      self: { addEventListener: (name: string, handler: (event: any) => void) => { handlers[name] = handler; }, location: { origin: 'https://meet.test' } },
      caches, fetch, URL, Response,
    });
    const waitUntil = vi.fn();
    handlers.install({ waitUntil });
    await waitUntil.mock.calls[0][0];
    expect(add).toHaveBeenCalledExactlyOnceWith('/offline.html');
    for (const url of ['https://meet.test/api/admin/users', 'https://media.test/file.mp4']) {
      const respondWith = vi.fn();
      handlers.fetch({ request: { url, method: 'GET', mode: 'navigate' }, respondWith });
      expect(respondWith).not.toHaveBeenCalled();
    }
    const respondWith = vi.fn();
    handlers.fetch({ request: { url: 'https://meet.test/admin', method: 'GET', mode: 'navigate' }, respondWith });
    expect(await respondWith.mock.calls[0][0]).toBe('offline');
  });
});