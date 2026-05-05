import type { Collection } from "mongodb";

export type SendGridEventRecord = Record<string, unknown>;

export function validateEvents(body: unknown): { ok: true } | { ok: false; error: string } {
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
    const o = ev as SendGridEventRecord;
    if (typeof o.event !== "string" || !o.event.trim()) {
      return { ok: false, error: `Missing or invalid event at index ${i}` };
    }
    const ts = o.timestamp;
    if (ts === undefined || ts === null || Number.isNaN(Number(ts))) {
      return { ok: false, error: `Missing or invalid timestamp at index ${i}` };
    }
  }
  return { ok: true };
}

function normalizeTimestamp(ev: SendGridEventRecord): number {
  const n = Number(ev.timestamp);
  return Number.isFinite(n) ? n : parseInt(String(ev.timestamp), 10);
}

export async function upsertEvents(
  collection: Collection,
  events: SendGridEventRecord[]
): Promise<{ inserted: number; matchedExisting: number }> {
  const ops = events.map((ev) => {
    const timestamp = normalizeTimestamp(ev);
    const message_id =
      typeof ev.sg_message_id === "string"
        ? ev.sg_message_id
        : ev.sg_message_id != null
          ? String(ev.sg_message_id)
          : "";
    const email =
      typeof ev.email === "string" ? ev.email : ev.email != null ? String(ev.email) : "";

    return {
      updateOne: {
        filter: { message_id, event: ev.event as string, timestamp },
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
