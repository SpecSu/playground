declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    FARM_MINIMAL_ONLINE?: string;
    FARM_OWNER_ACCOUNT_ID?: string;
    FARM_OWNER_SITE_SUBJECT?: string;
  }
}
