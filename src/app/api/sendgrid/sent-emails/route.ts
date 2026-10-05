import { NextResponse } from "next/server";

import { istYmdRangeToUtcIsoBounds, isValidYmd } from "@/lib/istUtcRange";
import {
  getEmailEventsCollection,
  getEmailSendsCollection,
  isMongoConfigured,
} from "@/lib/sendgridWebhook/mongo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type EmailDetailRow = {
  name: string;
  email: string;
  sentAt: string;
  university: string;
  detail: string;
  opensCount?: number;
  clicksCount?: number;
  status?: string;
};

type SendGridMessage = {
  to_email?: string;
  to_name?: string;
  from_email?: string;
  from_name?: string;
  subject?: string;
  status?: string;
  last_event_time?: string;
  opens_count?: number;
  clicks_count?: number;
};

type SendGridMessagesPayload = {
  messages?: SendGridMessage[];
  result?: SendGridMessage[];
  errors?: Array<{ message?: string }>;
  _metadata?: { next?: string };
  next?: string;
  links?: { next?: string };
};

function toSendGridTimestamp(iso: string) {
  return iso.replace(/\.\d{3}Z$/, "Z");
}

function mapMessage(m: SendGridMessage): EmailDetailRow | null {
  const email = m.to_email?.trim() || "";
  if (!email) return null;
  const opensCount = typeof m.opens_count === "number" ? m.opens_count : 0;
  const clicksCount = typeof m.clicks_count === "number" ? m.clicks_count : 0;
  const status = m.status?.trim() ?? "";

  let detail = status;
  if (!detail) {
    const parts: string[] = [];
    if (clicksCount > 0) parts.push(`Clicked ${clicksCount}x`);
    if (opensCount > 0) parts.push(`Opened ${opensCount}x`);
    detail = parts.length > 0 ? parts.join(" · ") : "Delivered";
  }

  return {
    name: m.to_name?.trim() || "—",
    email,
    sentAt: m.last_event_time || new Date().toISOString(),
    university: "—",
    detail,
    opensCount,
    clicksCount,
    status,
  };
}

async function fetchSendGridMessages(
  apiKey: string,
  query?: string
): Promise<{ rows: EmailDetailRow[]; error?: string; status?: number }> {
  const limit = 1000;
  const url = query
    ? `https://api.sendgrid.com/v3/messages?limit=${limit}&query=${encodeURIComponent(query)}`
    : `https://api.sendgrid.com/v3/messages?limit=${limit}`;

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${apiKey}` },
    cache: "no-store",
  });

  const body = await response.text();
  let payload: SendGridMessagesPayload = {};
  try {
    payload = JSON.parse(body) as SendGridMessagesPayload;
  } catch {
    return { rows: [], error: body.slice(0, 300), status: response.status };
  }

  if (!response.ok) {
    const fromApi = payload.errors?.[0]?.message || body.slice(0, 300);
    return { rows: [], error: fromApi, status: response.status };
  }

  const batch = payload.messages ?? payload.result ?? [];
  return {
    rows: batch.map(mapMessage).filter((row): row is EmailDetailRow => row !== null),
  };
}

function statusFromEvents(events: string[]): { status: string; detail: string } {
  const set = new Set(events.map((e) => e.toLowerCase()));
  if (set.has("spamreport")) return { status: "not_delivered", detail: "Spam report" };
  if (set.has("unsubscribe") || set.has("group_unsubscribe")) return { status: "delivered", detail: "Unsubscribed" };
  if (set.has("bounce") || set.has("blocked") || set.has("dropped")) {
    return { status: "not_delivered", detail: "Not delivered" };
  }
  if (set.has("deferred")) return { status: "not_delivered", detail: "Deferred" };
  if (set.has("open") || set.has("click")) return { status: "delivered", detail: "Opened" };
  if (set.has("delivered")) return { status: "delivered", detail: "Delivered" };
  if (set.has("processed")) return { status: "processed", detail: "Processed" };
  return { status: "processed", detail: events[0] || "Sent" };
}

async function rowsFromWebhookEvents(fromYmd: string, toYmd: string): Promise<EmailDetailRow[]> {
  if (!isMongoConfigured()) return [];
  const { startIso, endIso } = istYmdRangeToUtcIsoBounds(fromYmd, toYmd);
  const startUnix = Math.floor(new Date(startIso).getTime() / 1000);
  const endUnix = Math.floor(new Date(endIso).getTime() / 1000);
  const coll = await getEmailEventsCollection();
  const grouped = (await coll
    .aggregate([
      { $match: { timestamp: { $gte: startUnix, $lte: endUnix }, email: { $exists: true, $nin: ["", null] } } },
      { $sort: { timestamp: -1 } },
      {
        $group: {
          _id: { $toLower: "$email" },
          email: { $first: "$email" },
          lastTs: { $first: "$timestamp" },
          events: { $addToSet: "$event" },
          opensCount: { $sum: { $cond: [{ $eq: ["$event", "open"] }, 1, 0] } },
          clicksCount: { $sum: { $cond: [{ $eq: ["$event", "click"] }, 1, 0] } },
        },
      },
      { $limit: 10000 },
    ])
    .toArray()) as Array<{
    email?: string;
    lastTs?: number;
    events?: string[];
    opensCount?: number;
    clicksCount?: number;
  }>;

  return grouped
    .filter((row) => row.email)
    .map((row) => {
      const events = (row.events ?? []).map(String);
      const { status, detail } = statusFromEvents(events);
      const sentAt = row.lastTs ? new Date(Number(row.lastTs) * 1000).toISOString() : new Date().toISOString();
      return {
        name: "—",
        email: String(row.email),
        sentAt,
        university: "—",
        detail,
        opensCount: row.opensCount ?? 0,
        clicksCount: row.clicksCount ?? 0,
        status,
      };
    });
}

async function rowsFromSavedSends(fromYmd: string, toYmd: string): Promise<EmailDetailRow[]> {
  if (!isMongoConfigured()) return [];
  const { startIso, endIso } = istYmdRangeToUtcIsoBounds(fromYmd, toYmd);
  const startUnix = Math.floor(new Date(startIso).getTime() / 1000);
  const endUnix = Math.floor(new Date(endIso).getTime() / 1000);
  const coll = await getEmailSendsCollection();
  const docs = (await coll
    .find({ sentAtUnix: { $gte: startUnix, $lte: endUnix } })
    .sort({ sentAtUnix: -1 })
    .limit(10000)
    .toArray()) as Array<{
    email?: string;
    name?: string;
    university?: string;
    sentAt?: string;
    sentAtUnix?: number;
    subject?: string;
  }>;

  return docs
    .filter((doc) => doc.email)
    .map((doc) => ({
      name: doc.name?.trim() || "—",
      email: String(doc.email),
      sentAt: doc.sentAt || (doc.sentAtUnix ? new Date(doc.sentAtUnix * 1000).toISOString() : new Date().toISOString()),
      university: doc.university?.trim() || "—",
      detail: "Sent",
      opensCount: 0,
      clicksCount: 0,
      status: "processed",
    }));
}

function mergeRows(primary: EmailDetailRow[], extra: EmailDetailRow[]): EmailDetailRow[] {
  const byEmail = new Map<string, EmailDetailRow>();
  for (const row of [...extra, ...primary]) {
    const key = row.email.toLowerCase();
    const prev = byEmail.get(key);
    if (!prev) {
      byEmail.set(key, row);
      continue;
    }
    byEmail.set(key, {
      ...prev,
      ...row,
      name: row.name !== "—" ? row.name : prev.name,
      university: row.university !== "—" ? row.university : prev.university,
      opensCount: Math.max(prev.opensCount ?? 0, row.opensCount ?? 0),
      clicksCount: Math.max(prev.clicksCount ?? 0, row.clicksCount ?? 0),
      status: row.status || prev.status,
      detail: row.detail && row.detail !== "Sent" ? row.detail : prev.detail,
    });
  }
  return Array.from(byEmail.values()).sort((a, b) => (a.sentAt < b.sentAt ? 1 : -1));
}

export async function GET(request: Request) {
  const apiKey = process.env.SENDGRID_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ message: "Missing SENDGRID_API_KEY" }, { status: 500 });
  }

  const url = new URL(request.url);
  const fromParam = url.searchParams.get("from")?.trim() ?? "";
  const toParam = url.searchParams.get("to")?.trim() ?? "";

  let fromYmd = fromParam;
  let toYmd = toParam;
  if (fromYmd && toYmd) {
    if (!isValidYmd(fromYmd) || !isValidYmd(toYmd)) {
      return NextResponse.json({ message: "Invalid from / to date. Use YYYY-MM-DD." }, { status: 400 });
    }
    if (fromYmd > toYmd) [fromYmd, toYmd] = [toYmd, fromYmd];
  } else if (fromParam || toParam) {
    return NextResponse.json(
      { message: "Send both from and to as YYYY-MM-DD, or omit both for the campaign window." },
      { status: 400 }
    );
  } else {
    fromYmd = "2026-09-27";
    toYmd = new Date().toISOString().slice(0, 10);
  }

  const { startIso, endIso } = istYmdRangeToUtcIsoBounds(fromYmd, toYmd);
  const startTs = toSendGridTimestamp(startIso);
  const endTs = toSendGridTimestamp(endIso);
  const dateQuery = `last_event_time BETWEEN TIMESTAMP "${startTs}" AND TIMESTAMP "${endTs}"`;
  const sinceQuery = `last_event_time > TIMESTAMP "${startTs}"`;

  try {
    const attempts: Array<{ query: string; count: number; error?: string; status?: number }> = [];

    const dateResult = await fetchSendGridMessages(apiKey, dateQuery);
    attempts.push({ query: dateQuery, count: dateResult.rows.length, error: dateResult.error, status: dateResult.status });

    let rows = dateResult.rows;
    let source = rows.length > 0 ? "sendgrid-messages" : "";

    if (rows.length === 0) {
      const sinceResult = await fetchSendGridMessages(apiKey, sinceQuery);
      attempts.push({ query: sinceQuery, count: sinceResult.rows.length, error: sinceResult.error, status: sinceResult.status });
      if (sinceResult.rows.length > 0) {
        rows = sinceResult.rows;
        source = "sendgrid-messages-since";
      }
    }

    if (rows.length === 0) {
      const recentResult = await fetchSendGridMessages(apiKey);
      attempts.push({ query: "(none)", count: recentResult.rows.length, error: recentResult.error, status: recentResult.status });
      if (recentResult.rows.length > 0) {
        rows = recentResult.rows;
        source = "sendgrid-messages-recent";
      }
    }

    let storedRows: EmailDetailRow[] = [];
    try {
      const [eventRows, sendRows] = await Promise.all([rowsFromWebhookEvents(fromYmd, toYmd), rowsFromSavedSends(fromYmd, toYmd)]);
      storedRows = mergeRows(eventRows, sendRows);
    } catch (err) {
      attempts.push({
        query: "mongodb",
        count: 0,
        error: err instanceof Error ? err.message : "Mongo lookup failed",
      });
    }

    if (storedRows.length > 0) {
      rows = mergeRows(rows, storedRows);
      source = rows.length > 0 && source ? `${source}+mongodb` : "mongodb";
    }

    if (rows.length === 0) {
      const activityError = attempts.find((a) => a.status && a.status >= 400)?.error;
      return NextResponse.json({
        rows: [],
        count: 0,
        source: "none",
        query: dateQuery,
        attempts,
        message:
          activityError ||
          "SendGrid Stats can count these emails, but the Email Activity Feed has no recipient records. Enable Email Activity History for this API key in SendGrid, or keep Event Webhook storage on so opens/sends can be listed here.",
      });
    }

    return NextResponse.json({
      rows,
      count: rows.length,
      source,
      query: dateQuery,
      attempts,
    });
  } catch (error) {
    return NextResponse.json(
      {
        message: "Unexpected error fetching sent emails.",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
