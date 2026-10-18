import { credentialsValid, isSessionExpired, PASS_B64, USER_B64 } from '@/core/auth';
describe('auth', () => {
  test('accepts the same credentials the web app accepts', () => {
    expect(credentialsValid(atob(USER_B64), atob(PASS_B64))).toBe(true);
    expect(credentialsValid(atob(USER_B64), 'wrong')).toBe(false);
  });
  test('rejects wrong and empty credentials, including non-Latin1 input that makes btoa throw', () => {
    expect(credentialsValid('admin', 'admin')).toBe(false);
    expect(credentialsValid('', '')).toBe(false);
    expect(credentialsValid('பயனர்', 'கடவுச்சொல்')).toBe(false);
  });
  test('session expires after 24 hours; missing loginTime is not expired (web app behaviour)', () => {
    const now = Date.parse('2026-10-03T12:00:00Z');
    expect(isSessionExpired('2026-10-03T00:00:00Z', now)).toBe(false);
    expect(isSessionExpired('2026-10-02T12:00:00Z', now)).toBe(false); // exactly 24h
    expect(isSessionExpired('2026-10-02T11:59:00Z', now)).toBe(true);
    expect(isSessionExpired(null, now)).toBe(false);
  });
});
