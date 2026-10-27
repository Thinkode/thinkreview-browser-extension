import { unauthorizedResponseIsStale } from '../utils/extension-auth.js';

describe('unauthorizedResponseIsStale', () => {
  it('ignores a 401 for a token sign-in has already replaced', () => {
    expect(unauthorizedResponseIsStale('old-token', 'new-token')).toBe(true);
  });

  it('still clears the session when the rejected token is the current one', () => {
    expect(unauthorizedResponseIsStale('same-token', 'same-token')).toBe(false);
    expect(unauthorizedResponseIsStale(null, 'new-token')).toBe(false);
    expect(unauthorizedResponseIsStale('old-token', '')).toBe(false);
  });
});
