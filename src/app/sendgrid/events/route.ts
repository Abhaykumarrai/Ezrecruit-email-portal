import { NextResponse } from "next/server";

import { assertWebhookAuthorized } from "@/lib/sendgridWebhook/auth";
import { getEmailEventsCollection } from "@/lib/sendgridWebhook/mongo";
import {
  type SendGridEventRecord,
  upsertEvents,
  validateEvents,
} from "@/lib/sendgridWebhook/processBatch";

export const runtime = "nodejs";

/** SendGrid Event Webhook — same path as standalone Express server for easy DNS/Vercel setup */
export async function POST(request: Request) {
  const rawBody = await request.text();

  const auth = assertWebhookAuthorized(request, rawBody);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const checked = validateEvents(parsed);
  if (!checked.ok) {
    return NextResponse.json({ error: checked.error }, { status: 400 });
  }

  const events = parsed as SendGridEventRecord[];
  if (events.length === 0) {
    return NextResponse.json({ ok: true, processed: 0, inserted: 0, matchedExisting: 0 });
  }

  try {
    const coll = await getEmailEventsCollection();
    const stats = await upsertEvents(coll, events);
    return NextResponse.json({
      ok: true,
      processed: events.length,
      inserted: stats.inserted,
      matchedExisting: stats.matchedExisting,
    });
  } catch (err) {
    console.error("[sendgrid/events]", err);
    return NextResponse.json({ error: "Storage failed" }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json(
    { message: "SendGrid Event Webhook URL — use POST (configure this URL in SendGrid Mail Settings → Event Webhook)" },
    { status: 405 }
  );
}
