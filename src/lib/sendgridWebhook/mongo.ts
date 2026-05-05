import { type Collection, MongoClient } from "mongodb";

function stripBom(s: string) {
  return (s || "").trim().replace(/^\uFEFF/, "");
}

export function resolveMongoConnectionString(): { uri: string; source: string } {
  const host = stripBom(process.env.MONGODB_HOST ?? "");
  const user = stripBom(process.env.MONGODB_USER ?? "");
  const password = stripBom(process.env.MONGODB_PASSWORD ?? "");
  const rawUrl = stripBom(process.env.DATABASE_URL ?? "");

  if (host && user && password) {
    const appName = stripBom(process.env.MONGODB_APP_NAME ?? "") || "vercel-webhook";
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

  if (rawUrl) return { uri: rawUrl, source: "DATABASE_URL" };
  return { uri: "", source: "" };
}

const g = globalThis as unknown as { __sendgrid_mongo?: Promise<MongoClient> };

async function getMongoClient(): Promise<MongoClient> {
  if (g.__sendgrid_mongo) return g.__sendgrid_mongo;

  const { uri } = resolveMongoConnectionString();
  if (!uri) {
    throw new Error("MongoDB not configured (DATABASE_URL or MONGODB_HOST+USER+PASSWORD)");
  }

  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 15000 });
  g.__sendgrid_mongo = client.connect().then(() => client);
  return g.__sendgrid_mongo;
}

let indexesEnsured = false;

export async function getEmailEventsCollection(): Promise<Collection> {
  const client = await getMongoClient();
  const dbName = process.env.DATABASE_NAME?.trim() || "email_webhooks";
  const coll = client.db(dbName).collection("email_events");

  if (!indexesEnsured) {
    indexesEnsured = true;
    await Promise.all([
      coll.createIndex({ message_id: 1, event: 1, timestamp: 1 }, { unique: true, name: "dedupe_message_event_ts" }),
      coll.createIndex({ email: 1, timestamp: -1 }),
      coll.createIndex({ event: 1, timestamp: -1 }),
    ]).catch(() => {
      /* index exists / race — ignore */
    });
  }

  return coll;
}
