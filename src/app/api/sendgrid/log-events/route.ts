import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

type EventCounts = { opensCount: number; clicksCount: number };

async function countsForMessage(apiKey: string, messageId: string): Promise<EventCounts> {
  const response = await fetch(`https://api.sendgrid.com/v3/logs/${encodeURIComponent(messageId)}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
    cache: "no-store",
  });
  if (!response.ok) return { opensCount: 0, clicksCount: 0 };
  const payload = (await response.json()) as { events?: Array<{ event?: string; sg_machine_open?: boolean }> };
  const events = payload.events ?? [];
  return {
    // Match SendGrid unique-open stats: ignore Apple/privacy prefetch machine opens.
    opensCount: events.filter((event) => event.event === "open" && event.sg_machine_open !== true).length,
    clicksCount: events.filter((event) => event.event === "click").length,
  };
}

export async function POST(request: Request) {
  const apiKey = process.env.SENDGRID_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ message: "Missing SENDGRID_API_KEY" }, { status: 500 });
  }

  let ids: string[] = [];
  try {
    const body = (await request.json()) as { ids?: unknown };
    ids = Array.isArray(body.ids) ? body.ids.map((id) => String(id).trim()).filter(Boolean) : [];
  } catch {
    return NextResponse.json({ message: "Invalid JSON body." }, { status: 400 });
  }

  const uniqueIds = Array.from(new Set(ids)).slice(0, 25);
  const counts: Record<string, EventCounts> = {};
  await Promise.all(
    uniqueIds.map(async (id) => {
      counts[id] = await countsForMessage(apiKey, id);
    })
  );

  return NextResponse.json({ counts });
}
