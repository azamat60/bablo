// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const oauth = vi.hoisted(() => vi.fn());
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({ auth: { signInWithOAuth: oauth } }) }));
beforeEach(() => {
  vi.resetModules();
  vi.stubEnv('VITE_SUPABASE_URL', 'https://budget.example.com');
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'publishable-test');
  oauth.mockResolvedValue({ data: { url: 'https://auth.example.com/oauth' }, error: null });
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});
describe('Google login navigation', () => {
  it('keeps installed app login in the current context and preserves PKCE return origin', async () => {
    vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: true } as MediaQueryList);
    const open = vi.spyOn(window, 'open').mockReturnValue(window);
    const assign = vi.spyOn(window.location, 'assign').mockImplementation(() => {});
    const { signIn } = await import('../auth');
    await signIn();
    expect(oauth).toHaveBeenCalledWith({
      provider: 'google',
      options: {
        skipBrowserRedirect: true,
        redirectTo: `${location.origin}/auth/callback`,
        scopes: 'openid email profile',
        queryParams: { prompt: 'select_account' },
      },
    });
    expect(open).toHaveBeenCalledWith('https://auth.example.com/oauth', '_self');
    expect(assign).not.toHaveBeenCalled();
  });
  it('preserves the regular browser redirect flow', async () => {
    vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: false } as MediaQueryList);
    const open = vi.spyOn(window, 'open').mockReturnValue(window);
    const assign = vi.spyOn(window.location, 'assign').mockImplementation(() => {});
    const { signIn } = await import('../auth');
    await signIn();
    expect(assign).toHaveBeenCalledWith('https://auth.example.com/oauth');
    expect(open).not.toHaveBeenCalled();
  });
  it('does not navigate after a provider error', async () => {
    vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: true } as MediaQueryList);
    const open = vi.spyOn(window, 'open').mockReturnValue(window);
    const assign = vi.spyOn(window.location, 'assign').mockImplementation(() => {});
    oauth.mockResolvedValue({ data: { url: null }, error: new Error('provider unavailable') });
    const { signIn } = await import('../auth');
    await expect(signIn()).rejects.toThrow('provider unavailable');
    expect(open).not.toHaveBeenCalled();
    expect(assign).not.toHaveBeenCalled();
  });
});
