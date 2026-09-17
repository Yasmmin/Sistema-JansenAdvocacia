declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    GOOGLE_CLIENT_ID?: string;
    GOOGLE_CLIENT_SECRET?: string;
    GOOGLE_OAUTH_REDIRECT_URI?: string;
    GOOGLE_TOKEN_ENCRYPTION_KEY?: string;
    GOOGLE_CALENDAR_WEBHOOK_URL?: string;
    GOOGLE_CALENDAR_INCLUDED_IDS?: string;
    GOOGLE_CALENDAR_DEFAULT_ID?: string;
    CALENDAR_CRON_SECRET?: string;
    DATAJUD_API_KEY?: string;
  }
}
