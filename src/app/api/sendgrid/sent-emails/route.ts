import { NextResponse } from "next/server";

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
  _metadata?: {
    next?: string;
  };
  next?: string;
  links?: {
    next?: string;
  };
};

export async function GET(request: Request) {
  const apiKey = process.env.SENDGRID_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ message: "Missing SENDGRID_API_KEY" }, { status: 500 });
  }

  const url = new URL(request.url);
  const limitParam = Number(url.searchParams.get("limit") || "5000");
  const limit = Number.isFinite(limitParam) ? Math.min(Math.max(limitParam, 1), 10000) : 5000;
  const pageSize = 500;
  const maxPages = 40;

  // Messages endpoint availability depends on account plan/add-ons.
  const sgBaseUrl = "https://api.sendgrid.com/v3/messages";
  const toAbsoluteUrl = (next: string) => (next.startsWith("http") ? next : `https://api.sendgrid.com${next}`);

  try {
    const messages: SendGridMessage[] = [];
    let nextUrl: string | null = `${sgBaseUrl}?limit=${pageSize}`;
    let page = 0;

    while (nextUrl && page < maxPages && messages.length < limit) {
      const response = await fetch(nextUrl, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
        cache: "no-store",
      });

      if (!response.ok) {
        const body = await response.text();
        return NextResponse.json(
          {
            message: "Unable to fetch recipient emails from SendGrid Messages API.",
            status: response.status,
            details: body.slice(0, 500),
          },
          { status: 502 }
        );
      }

      const payload = (await response.json()) as SendGridMessagesPayload;
      const batch = payload.messages ?? payload.result ?? [];
      messages.push(...batch);

      const nextFromPayload = payload._metadata?.next || payload.next || payload.links?.next;
      nextUrl =
        nextFromPayload && batch.length > 0 && messages.length < limit
          ? toAbsoluteUrl(nextFromPayload)
          : null;
      page += 1;
    }

    const rows = messages
      .filter((m) => Boolean(m.to_email))
      .map((m) => ({
        name: m.to_name?.trim() || "—",
        email: m.to_email?.trim() || "",
        sentAt: m.last_event_time || new Date().toISOString(),
        company: "—",
        detail:
          m.status?.trim() ||
          (typeof m.opens_count === "number" && m.opens_count > 0
            ? `Opened ${m.opens_count}x`
            : typeof m.clicks_count === "number" && m.clicks_count > 0
              ? `Clicked ${m.clicks_count}x`
              : "Delivered"),
      }))
      .slice(0, limit);

    return NextResponse.json({ rows, count: rows.length, fetchedPages: Math.min(page, maxPages) });
  } catch (error) {
    return NextResponse.json(
      {
        message: "Unexpected error fetching SendGrid messages.",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
