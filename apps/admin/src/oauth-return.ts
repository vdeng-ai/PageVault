/** Only the existing same-origin OAuth consent route can follow a successful login. */
export function oauthReturnPath(search: string, origin: string): string | null {
  const value = new URLSearchParams(search).get("oauthReturnTo");
  if (!value?.startsWith("/oauth/authorize?")) return null;
  try {
    const target = new URL(value, origin);
    if (
      target.origin !== origin ||
      target.pathname !== "/oauth/authorize" ||
      target.hash ||
      target.username ||
      target.password
    )
      return null;
    return `${target.pathname}${target.search}`;
  } catch {
    return null;
  }
}
