/**
 * Minimal SendGrid Event Webhook receiver → MongoDB `email_events`.
 */
require("dotenv").config();

const express = require("express");
const { MongoClient } = require("mongodb");
const { EventWebhook, EventWebhookHeader } = require("@sendgrid/eventwebhook");

const PORT = Number(process.env.PORT) || 3001;
const DATABASE_NAME = (process.env.DATABASE_NAME || "email_webhooks").trim();
const WEBHOOK_SECRET = (process.env.WEBHOOK_SECRET || "").trim();
/** Paste “Verification Key” from SendGrid Event Webhook (Signed Event Webhook). Enables ECDSA verification. */
const SENDGRID_VERIFICATION_KEY = (process.env.SENDGRID_VERIFICATION_KEY || "").trim();
/** Max skew between SendGrid timestamp header and server time (seconds). */
const WEBHOOK_TS_TOLERANCE_SEC = Number(process.env.WEBHOOK_TS_TOLERANCE_SEC) || 600;

const COLLECTION = "email_events";

function log(...args) {
  console.log(new Date().toISOString(), ...args);
}

function logError(...args) {
  console.error(new Date().toISOString(), ...args);
}

function maskMongoUri(uri) {
  try {
    return uri.replace(/:([^@]+)@/, ":****@");
  } catch {
    return "(unable to mask)";
  }
}

function stripBom(s) {
  return (s || "").trim().replace(/^\uFEFF/, "");
}

/**
 * Prefer split vars so passwords are never manually URL-encoded in .env.
 * If all three are set, they override DATABASE_URL.
 */
function resolveMongoConnectionString() {
  const host = stripBom(process.env.MONGODB_HOST);
  const user = stripBom(process.env.MONGODB_USER);
  const password = stripBom(process.env.MONGODB_PASSWORD);
  const rawUrl = stripBom(process.env.DATABASE_URL);

  if (host && user && password) {
    const appName = stripBom(process.env.MONGODB_APP_NAME) || "sendgrid-webhook";
    const qs = new URLSearchParams({
      retryWrites: "true",
      w: "majority",
      appName,
    });
    return {
      uri: `mongodb+srv://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}/?${qs.toString()}`,
      source: "MONGODB_HOST + MONGODB_USER + MONGODB_PASSWORD",
    };
  }

  if (rawUrl) {
    return { uri: rawUrl, source: "DATABASE_URL" };
  }

  return { uri: "", source: "" };
}

function printAtlasAuthHelp(mongoUri, source) {
  logError("");
  logError("Atlas rejected the database username/password.");
  logError(`  • Built from: ${source}`);
  logError(`  • URI (password hidden): ${maskMongoUri(mongoUri)}`);
  logError("");
  logError("Fix:");
  logError("  1) Atlas → Database Access → confirm user exists → Edit Password → generate NEW password.");
  logError("  2) Use split env vars (no encoding needed):");
  logError("       MONGODB_HOST=your-cluster.xxxxx.mongodb.net");
  logError("       MONGODB_USER=your_db_username");
  logError("       MONGODB_PASSWORD=paste_password_here");
  logError("     Remove or comment DATABASE_URL while testing so split vars win.");
  logError("  3) Username must match Database Access exactly (often NOT your Atlas login email).");
  logError("");
}

/** Basic validation: SendGrid posts a JSON array of event objects. */
function validateEvents(body) {
  if (!Array.isArray(body)) {
    return { ok: false, error: "Body must be a JSON array of events" };
  }
  if (body.length > 5000) {
    return { ok: false, error: "Batch too large (max 5000 events per request)" };
  }
  for (let i = 0; i < body.length; i++) {
    const ev = body[i];
    if (!ev || typeof ev !== "object" || Array.isArray(ev)) {
      return { ok: false, error: `Invalid event at index ${i}` };
    }
    if (typeof ev.event !== "string" || !ev.event.trim()) {
      return { ok: false, error: `Missing or invalid event at index ${i}` };
    }
    const ts = ev.timestamp;
    if (ts === undefined || ts === null || Number.isNaN(Number(ts))) {
      return { ok: false, error: `Missing or invalid timestamp at index ${i}` };
    }
  }
  return { ok: true };
}

function optionalWebhookAuth(req, res, next) {
  if (!WEBHOOK_SECRET) return next();
  const header = req.get("x-webhook-secret");
  const query = req.query.secret;
  if (header === WEBHOOK_SECRET || query === WEBHOOK_SECRET) return next();
  log("Webhook auth failed: missing or wrong secret");
  return res.status(401).json({ error: "Unauthorized" });
}

/** SendGrid dashboard shows base64 without PEM headers — starkbank expects PEM. */
function normalizeVerificationKey(key) {
  const trimmed = key.trim();
  if (!trimmed) return trimmed;
  if (/BEGIN\s+PUBLIC\s+KEY/i.test(trimmed)) return trimmed;
  const body = trimmed.replace(/\s+/g, "");
  const lines = body.match(/.{1,64}/g) || [body];
  return ["-----BEGIN PUBLIC KEY-----", ...lines, "-----END PUBLIC KEY-----"].join("\n");
}

function verifySendGridSignedRequest(req) {
  if (!SENDGRID_VERIFICATION_KEY) return true;

  const signature = req.get(EventWebhookHeader.SIGNATURE());
  const timestamp = req.get(EventWebhookHeader.TIMESTAMP());
  if (!signature || !timestamp) {
    log("Signed webhook: missing X-Twilio-Email-Event-Webhook-* headers");
    return false;
  }

  const tsNum = Number(timestamp);
  if (!Number.isFinite(tsNum)) return false;
  if (Math.abs(Date.now() / 1000 - tsNum) > WEBHOOK_TS_TOLERANCE_SEC) {
    log("Signed webhook: timestamp outside tolerance");
    return false;
  }

  const payload = req.rawBody instanceof Buffer ? req.rawBody.toString("utf8") : "";
  const ew = new EventWebhook();
  let publicKey;
  try {
    publicKey = ew.convertPublicKeyToECDSA(normalizeVerificationKey(SENDGRID_VERIFICATION_KEY));
  } catch (err) {
    logError("SENDGRID_VERIFICATION_KEY is not valid PEM/SPKI:", err.message);
    return false;
  }

  try {
    return ew.verifySignature(publicKey, payload, signature, timestamp);
  } catch {
    return false;
  }
}

/** Prefer SendGrid signed verification when key is set; otherwise optional shared secret. */
function webhookGuard(req, res, next) {
  if (SENDGRID_VERIFICATION_KEY) {
    if (!verifySendGridSignedRequest(req)) {
      return res.status(401).json({ error: "Invalid SendGrid webhook signature" });
    }
    return next();
  }
  return optionalWebhookAuth(req, res, next);
}

function normalizeTimestamp(ev) {
  const n = Number(ev.timestamp);
  return Number.isFinite(n) ? n : parseInt(String(ev.timestamp), 10);
}

async function upsertEvents(collection, events) {
  const ops = events.map((ev) => {
    const timestamp = normalizeTimestamp(ev);
    const message_id =
      typeof ev.sg_message_id === "string" ? ev.sg_message_id : ev.sg_message_id != null ? String(ev.sg_message_id) : "";
    const email = typeof ev.email === "string" ? ev.email : ev.email != null ? String(ev.email) : "";

    return {
      updateOne: {
        filter: { message_id, event: ev.event, timestamp },
        update: {
          $setOnInsert: {
            email,
            event: ev.event,
            timestamp,
            message_id,
            raw: ev,
            stored_at: new Date(),
          },
        },
        upsert: true,
      },
    };
  });

  const result = await collection.bulkWrite(ops, { ordered: false });
  return {
    inserted: result.upsertedCount,
    matchedExisting: result.matchedCount,
  };
}

async function main() {
  const { uri: mongoUri, source } = resolveMongoConnectionString();
  if (!mongoUri) {
    logError("Set DATABASE_URL, or set all three: MONGODB_HOST, MONGODB_USER, MONGODB_PASSWORD");
    process.exit(1);
  }

  if (mongoUri.includes("<password>") || mongoUri.includes("<username>")) {
    logError("URI still contains <password> or <username> placeholder — replace with real Database User credentials.");
    process.exit(1);
  }

  const client = new MongoClient(mongoUri, {
    serverSelectionTimeoutMS: 15000,
  });

  try {
    await client.connect();
  } catch (err) {
    const code = err && typeof err === "object" && "code" in err ? err.code : null;
    if (code === 8000 || /bad auth|authentication failed/i.test(String(err && err.message))) {
      printAtlasAuthHelp(mongoUri, source);
    }
    throw err;
  }
  const db = client.db(DATABASE_NAME);
  const coll = db.collection(COLLECTION);

  await coll.createIndex({ message_id: 1, event: 1, timestamp: 1 }, { unique: true, name: "dedupe_message_event_ts" });
  await coll.createIndex({ email: 1, timestamp: -1 });
  await coll.createIndex({ event: 1, timestamp: -1 });

  log(`MongoDB connected: ${DATABASE_NAME}.${COLLECTION}`);
  if (SENDGRID_VERIFICATION_KEY) {
    log("SendGrid Signed Event Webhook verification enabled (SENDGRID_VERIFICATION_KEY).");
  } else if (!WEBHOOK_SECRET) {
    log("WARN: Webhook has no SENDGRID_VERIFICATION_KEY or WEBHOOK_SECRET — POST /sendgrid/events accepts unsigned traffic.");
  }

  const app = express();

  app.use(
    express.json({
      limit: "2mb",
      verify: (req, _res, buf) => {
        req.rawBody = buf;
      },
    })
  );

  app.use((req, _res, next) => {
    log(req.method, req.path);
    next();
  });

  app.get("/health", (_req, res) => {
    res.json({ ok: true, service: "sendgrid-webhook-server" });
  });

  /**
   * POST /sendgrid/events
   * SendGrid sends Content-Type: application/json body = array of events.
   */
  app.post("/sendgrid/events", webhookGuard, async (req, res) => {
    const checked = validateEvents(req.body);
    if (!checked.ok) {
      return res.status(400).json({ error: checked.error });
    }

    if (req.body.length === 0) {
      return res.json({ ok: true, processed: 0, inserted: 0, matchedExisting: 0 });
    }

    try {
      const stats = await upsertEvents(coll, req.body);
      return res.status(200).json({
        ok: true,
        processed: req.body.length,
        inserted: stats.inserted,
        matchedExisting: stats.matchedExisting,
      });
    } catch (err) {
      logError("Bulk upsert error:", err.message);
      return res.status(500).json({ error: "Storage failed" });
    }
  });

  /**
   * GET /events — inspect stored rows (protect this route in production: firewall / VPN / separate secret).
   */
  app.get("/events", async (req, res) => {
    const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 500);
    const filter = {};

    if (req.query.email && typeof req.query.email === "string") {
      filter.email = req.query.email.trim();
    }
    if (req.query.event && typeof req.query.event === "string") {
      filter.event = req.query.event.trim();
    }

    try {
      const items = await coll
        .find(filter)
        .sort({ timestamp: -1 })
        .limit(limit)
        .project({ raw: 0 })
        .toArray();

      const totalApprox = await coll.countDocuments(filter);

      return res.json({
        limit,
        filter,
        count: items.length,
        totalMatching: totalApprox,
        items,
      });
    } catch (err) {
      logError("GET /events error:", err.message);
      return res.status(500).json({ error: "Query failed" });
    }
  });

  app.use((_req, res) => {
    res.status(404).json({ error: "Not found" });
  });

  app.listen(PORT, () => {
    log(`Listening on http://localhost:${PORT}`);
    log(`Webhook: POST http://localhost:${PORT}/sendgrid/events`);
  });

  const shutdown = async () => {
    log("Shutting down…");
    await client.close();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  logError(err);
  process.exit(1);
});
