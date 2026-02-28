type NativeIntentRedirectArgs = {
  path: string;
  initial: boolean;
};

const THREAD_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function ensureLeadingSlash(value: string): string {
  if (!value) {
    return '/';
  }
  return value.startsWith('/') ? value : `/${value}`;
}

function normalizeThreadDeepLink(path: string): string {
  const trimmed = path.trim();
  if (!trimmed) {
    return '/';
  }

  const normalized = ensureLeadingSlash(trimmed);

  // Handle crabbot://thread/<id> when host information survives URL parsing.
  try {
    const url = new URL(trimmed, 'crabbot://local');
    if (url.protocol === 'crabbot:' && url.host === 'thread') {
      const threadPath = ensureLeadingSlash(url.pathname);
      return `/thread${threadPath}${url.search}${url.hash}`;
    }
  } catch {
    // Keep parsing with fallback heuristics.
  }

  // Some Android launches strip the host and only pass '/<id>' for crabbot://thread/<id>.
  const [pathnameOnly] = normalized.split(/[?#]/, 1);
  const segments = pathnameOnly.split('/').filter(Boolean);
  if (segments.length === 1 && THREAD_ID_PATTERN.test(segments[0])) {
    return `/thread/${segments[0]}`;
  }

  return normalized;
}

export function redirectSystemPath({ path }: NativeIntentRedirectArgs): string {
  return normalizeThreadDeepLink(path);
}
