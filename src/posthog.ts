import posthog from 'posthog-js';

// Feature C (§4) / User Story 3 (§5.2): PostHog feature toggle + A/B test.
// The flag key below controls the alternate UI theme; PostHog splits users
// into Group A (flag off → light theme) and Group B (flag on → dark theme).
export const ALTERNATE_UI_FLAG = 'alternate-ui';

// optional chaining: import.meta.env only exists under Vite, not under Jest
const key = import.meta.env?.VITE_POSTHOG_KEY as string | undefined;
const host =
  (import.meta.env?.VITE_POSTHOG_HOST as string | undefined) ??
  'https://eu.i.posthog.com';

export const posthogEnabled = Boolean(key);

if (key) {
  posthog.init(key, {
    api_host: host,
    capture_pageview: true,
    autocapture: false,
  });
}

export function captureEvent(
  event: string,
  properties?: Record<string, unknown>,
): void {
  if (posthogEnabled) posthog.capture(event, properties);
}

export function onAlternateUiFlag(callback: (enabled: boolean) => void): void {
  if (!posthogEnabled) {
    callback(false);
    return;
  }
  posthog.onFeatureFlags(() => {
    callback(posthog.isFeatureEnabled(ALTERNATE_UI_FLAG) === true);
  });
}
