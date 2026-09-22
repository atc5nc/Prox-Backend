export const NOTIFICATION_CRON_HEADER = "x-notification-cron-secret";

export function isAuthorizedNotificationCronRequest(params: {
  req: Request;
  secret: string;
}): boolean {
  return params.req.headers.get(NOTIFICATION_CRON_HEADER) === params.secret;
}
