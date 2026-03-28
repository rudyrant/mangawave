import fs from "fs/promises";
import path from "path";
import connectPgSimple from "connect-pg-simple";
import createFileStore from "session-file-store";
import { pool, isPostgresEnabled } from "./db.js";

export async function createSessionStore(sessionLib) {
  if (isPostgresEnabled()) {
    const PgStore = connectPgSimple(sessionLib);
    return new PgStore({
      pool,
      tableName: "user_sessions",
      createTableIfMissing: true,
    });
  }

  const sessionPath = process.env.SESSION_FILE_PATH || path.join(process.cwd(), "content", "sessions");
  await fs.mkdir(sessionPath, { recursive: true });
  const FileStore = createFileStore(sessionLib);
  return new FileStore({
    path: sessionPath,
    ttl: 60 * 60 * 24 * 14,
    retries: 1,
  });
}
