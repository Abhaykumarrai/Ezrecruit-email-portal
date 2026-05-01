import { NextResponse } from "next/server";

type SuppressionItem = { created: number; email: string };

async function fetchSuppressionPage(
  apiKey: string,
  path: string,
  limit: number,
  offset: number,
  startUnix?: number,
  endUnix?: number
) {
  const qs = new URLSearchParams();
  qs.set("limit", String(limit));
  qs.set("offset", String(offset));
  if (startUnix !== undefined) qs.set("start_time", String(startUnix));
  if (endUnix !== undefined) qs.set("end_time", String(endUnix));

  const res = await fetch(`https://api.sendgrid.com/v3${path}?${qs}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
    cache: "no-store",
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(body.slice(0, 400));
  }

  const batch = (await res.json()) as SuppressionItem[];
  return Array.isArray(batch) ? batch : [];
}

async function fetchSuppressionList(
  apiKey: string,
  path: string,
  maxItems: number,
  startUnix?: number,
  endUnix?: number
) {
  const pageSize = 500;
  const items: SuppressionItem[] = [];
  let offset = 0;

  while (items.length < maxItems) {
    const need = Math.min(pageSize, maxItems - items.length);
    const batch = await fetchSuppressionPage(apiKey, path, need, offset, startUnix, endUnix);
    if (batch.length === 0) break;
    items.push(...batch);
    offset += batch.length;
    if (batch.length < need) break;
  }

  return items.slice(0, maxItems);
}

export async function GET(request: Request) {
  const apiKey = process.env.SENDGRID_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ message: "Missing SENDGRID_API_KEY" }, { status: 500 });
  }

  const url = new URL(request.url);
  const limitParam = Number(url.searchParams.get("limit") || "2000");
  const limit = Number.isFinite(limitParam) ? Math.min(Math.max(limitParam, 1), 10000) : 2000;

  const daysParam = Number(url.searchParams.get("days") || "365");
  const days = Number.isFinite(daysParam) ? Math.min(Math.max(daysParam, 1), 3650) : 365;

  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - days);
  const startUnix = Math.floor(start.getTime() / 1000);
  const endUnix = Math.floor(end.getTime() / 1000);

  try {
    const [spamList, unsubList] = await Promise.all([
      fetchSuppressionList(apiKey, "/suppression/spam_reports", limit, startUnix, endUnix),
      fetchSuppressionList(apiKey, "/suppression/unsubscribes", limit, startUnix, endUnix),
    ]);

    const mapRows = (detail: string) =>
      (items: SuppressionItem[]) =>
        items.map((item) => ({
          name: "—",
          email: item.email,
          sentAt: new Date(item.created * 1000).toISOString(),
          company: "—",
          detail,
        }));

    return NextResponse.json({
      spamRows: mapRows("Spam report")(spamList),
      unsubscribedRows: mapRows("Global unsubscribe")(unsubList),
      range: { startUnix, endUnix, days },
    });
  } catch (error) {
    return NextResponse.json(
      {
        message:
          "Unable to fetch spam / unsubscribe suppressions. Ensure the API key can read suppressions (Spam Reports + Unsubscribes).",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 502 }
    );
  }
}
