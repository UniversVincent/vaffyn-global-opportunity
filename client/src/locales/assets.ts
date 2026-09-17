/** Optional translations already recover through ensureLocale; do not reload unsent drafts. */
export function isLocaleLoadError(error?: { message?: string } | null): boolean {
  return /\/(?:assets\/locale-[^/?#\s]+\.js|src\/locales\/[^/?#\s]+\/translation\.json)(?:[?#][^\s]*)?(?:$|[\s"'])/.test(
    error?.message ?? '',
  );
}
