import { jest } from '@jest/globals';
import {
  posthogEnabled,
  captureEvent,
  onAlternateUiFlag,
  ALTERNATE_UI_FLAG,
} from './posthog.ts';

// Under Jest no VITE_POSTHOG_KEY is set, so the module must take the
// disabled path: no init, no network calls, variant A for everyone.
describe('posthog module without a configured key', () => {
  it('reports PostHog as disabled', () => {
    expect(posthogEnabled).toBe(false);
  });

  it('uses the documented feature flag key', () => {
    expect(ALTERNATE_UI_FLAG).toBe('alternate-ui');
  });

  it('captureEvent is a safe no-op', () => {
    expect(() => captureEvent('note_created', { ui_variant: 'A' })).not.toThrow();
  });

  it('onAlternateUiFlag resolves to variant A (flag off)', () => {
    const callback = jest.fn();
    onAlternateUiFlag(callback);
    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith(false);
  });
});
