import fs from "fs/promises";
import path from "path";

const auditPath = path.join(process.cwd(), "content", "audit.log");

function clientIp(req) {
  return req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.socket.remoteAddress || "unknown";
}

export async function logAuditEvent(req, event) {
  const payload = {
    timestamp: new Date().toISOString(),
    category: event.category,
    action: event.action,
    outcome: event.outcome,
    actorId: event.actorId || req.session?.userId || null,
    targetId: event.targetId || null,
    ip: clientIp(req),
    method: req.method,
    path: req.originalUrl,
    userAgent: req.get("user-agent") || null,
    details: event.details || {},
  };

  await fs.mkdir(path.dirname(auditPath), { recursive: true });
  await fs.appendFile(auditPath, `${JSON.stringify(payload)}
`, "utf8");
}
