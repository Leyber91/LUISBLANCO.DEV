// No test reaches the network. The default transport looks fetch up at the moment it sends, so a test that
// forgets to pass its own backend finds this one, which refuses and counts the attempt.
import { beforeEach } from 'vitest';

export const network = { attempts: 0 };

const refuse = (): Promise<Response> => {
  network.attempts++;
  return Promise.reject(new TypeError('tests do not reach the network'));
};

beforeEach(() => {
  network.attempts = 0;
  globalThis.fetch = refuse as typeof fetch;
  if (typeof window !== 'undefined') window.fetch = refuse as typeof fetch;
});
