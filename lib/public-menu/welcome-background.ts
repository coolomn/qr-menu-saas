/** Default welcome hero when restaurant has no custom background. Same photo, smaller width. */
export const DEFAULT_WELCOME_BACKGROUND_URL =
  "https://images.unsplash.com/photo-1514933651103-005eec06c04b?q=80&w=1280&auto=format&fit=crop";

export function resolveWelcomeBackgroundSrc(
  welcomeBgUrl: string | null | undefined
): string {
  const trimmed = welcomeBgUrl?.trim();
  return trimmed || DEFAULT_WELCOME_BACKGROUND_URL;
}
