// Cron routes are triggered by Vercel Cron, which sends `Authorization: Bearer <CRON_SECRET>`.
// In production CRON_SECRET must be set; locally the routes can be hit without it for testing.
export function isCronAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return process.env.NODE_ENV !== "production";
  return request.headers.get("authorization") === `Bearer ${secret}`;
}
