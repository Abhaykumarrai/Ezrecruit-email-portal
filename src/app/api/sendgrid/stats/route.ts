import { NextResponse } from "next/server";

type SendGridMetrics = {
  requests?: number;
  delivered?: number;
  opens?: number;
  unique_opens?: number;
  clicks?: number;
  unique_clicks?: number;
  bounces?: number;
  spam_reports?: number;
  unsubscribes?: number;
  blocks?: number;
  invalid_emails?: number;
  deferred?: number;
  bounce_drops?: number;
  spam_report_drops?: number;
  unsubscribe_drops?: number;
};

type StatsBucket = {
  metrics?: SendGridMetrics;
};

type StatsDay = {
  stats?: StatsBucket[];
};

function toPct(part: number, whole: number, digits = 1) {
  if (whole <= 0) return 0;
  return Number(((part / whole) * 100).toFixed(digits));
}

/**
 * Prefer unique recipients per day (SendGrid `unique_opens` / `unique_clicks`).
 * Total `opens` / `clicks` repeat-count the same recipient and inflate the dashboard.
 */
function dayUniqueOrTotal(total: number | undefined, unique: number | undefined): number {
  if (unique !== undefined && unique !== null && Number.isFinite(unique)) {
    return Math.max(0, unique);
  }
  return total ?? 0;
}

function dayOpens(m: SendGridMetrics): number {
  return dayUniqueOrTotal(m.opens, m.unique_opens);
}

function dayClicks(m: SendGridMetrics): number {
  return dayUniqueOrTotal(m.clicks, m.unique_clicks);
}

type GlobalUnsubRow = { created?: number; email?: string };

/**
 * Global suppression unsubscribes match what SendGrid shows under Suppressions → Unsubscribes.
 * Aggregate stats often report `unsubscribes` as 0 even when this list has rows, so we merge both.
 */
async function countGlobalSuppressionsUnsubscribes(
  apiKey: string,
  startUnix: number,
  endUnix: number
): Promise<number> {
  let total = 0;
  let offset = 0;
  const pageLimit = 500;
  const maxPages = 60;

  for (let page = 0; page < maxPages; page++) {
    const qs = new URLSearchParams({
      limit: String(pageLimit),
      offset: String(offset),
      start_time: String(startUnix),
      end_time: String(endUnix),
    });

    const res = await fetch(`https://api.sendgrid.com/v3/suppression/unsubscribes?${qs}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      cache: "no-store",
    });

    if (!res.ok) {
      throw new Error(`SendGrid suppression unsubscribes HTTP ${res.status}`);
    }

    const batch = (await res.json()) as GlobalUnsubRow[];
    if (!Array.isArray(batch) || batch.length === 0) break;

    total += batch.length;
    offset += batch.length;
    if (batch.length < pageLimit) break;
  }

  return total;
}

export async function GET(request: Request) {
  const apiKey = process.env.SENDGRID_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ message: "Missing SENDGRID_API_KEY" }, { status: 500 });
  }

  const url = new URL(request.url);
  const daysParam = Number(url.searchParams.get("days") || "30");
  const days = Number.isFinite(daysParam) ? Math.min(Math.max(daysParam, 1), 90) : 30;

  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - days);

  const startDate = start.toISOString().slice(0, 10);
  const endDate = end.toISOString().slice(0, 10);

  const startUnix = Math.floor(Date.parse(`${startDate}T00:00:00.000Z`) / 1000);
  const endUnix = Math.floor(Date.parse(`${endDate}T23:59:59.999Z`) / 1000);

  const sgUrl = `https://api.sendgrid.com/v3/stats?start_date=${startDate}&end_date=${endDate}&aggregated_by=day`;

  try {
    const [response, suppressionUnsubCount] = await Promise.all([
      fetch(sgUrl, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
        cache: "no-store",
      }),
      countGlobalSuppressionsUnsubscribes(apiKey, startUnix, endUnix).catch(() => null),
    ]);

    if (!response.ok) {
      const body = await response.text();
      return NextResponse.json(
        {
          message: "Unable to fetch SendGrid stats. Check API key scopes (Stats Read).",
          status: response.status,
          details: body.slice(0, 500),
        },
        { status: 502 }
      );
    }

    const payload = (await response.json()) as StatsDay[];

    const totals = payload.reduce(
      (acc, day) => {
        for (const bucket of day.stats ?? []) {
          const m = bucket.metrics ?? {};
          acc.requests += m.requests ?? 0;
          acc.delivered += m.delivered ?? 0;
          acc.opensTotal += m.opens ?? 0;
          acc.uniqueOpens += m.unique_opens ?? 0;
          acc.opens += dayOpens(m);
          acc.clicksTotal += m.clicks ?? 0;
          acc.uniqueClicks += m.unique_clicks ?? 0;
          acc.clicks += dayClicks(m);
          acc.bounces += m.bounces ?? 0;
          acc.spamReports += m.spam_reports ?? 0;
          acc.unsubscribes += m.unsubscribes ?? 0;
          acc.blocks += m.blocks ?? 0;
          acc.invalidEmails += m.invalid_emails ?? 0;
          acc.deferred += m.deferred ?? 0;
          acc.bounceDrops += m.bounce_drops ?? 0;
          acc.spamReportDrops += m.spam_report_drops ?? 0;
          acc.unsubscribeDrops += m.unsubscribe_drops ?? 0;
        }
        return acc;
      },
      {
        requests: 0,
        delivered: 0,
        opensTotal: 0,
        uniqueOpens: 0,
        opens: 0,
        clicksTotal: 0,
        uniqueClicks: 0,
        clicks: 0,
        bounces: 0,
        spamReports: 0,
        unsubscribes: 0,
        blocks: 0,
        invalidEmails: 0,
        deferred: 0,
        bounceDrops: 0,
        spamReportDrops: 0,
        unsubscribeDrops: 0,
      }
    );

    const undelivered =
      totals.bounces +
      totals.blocks +
      totals.invalidEmails +
      totals.deferred +
      totals.bounceDrops +
      totals.spamReportDrops +
      totals.unsubscribeDrops;

    const sent = totals.requests || totals.delivered;
    const engagementBase = totals.delivered > 0 ? totals.delivered : sent;

    const unsubscribed =
      suppressionUnsubCount !== null ? Math.max(totals.unsubscribes, suppressionUnsubCount) : totals.unsubscribes;

    return NextResponse.json({
      range: { startDate, endDate, days },
      totals: {
        sent,
        delivered: totals.delivered,
        opens: totals.opens,
        clicks: totals.clicks,
        spamReports: totals.spamReports,
        unsubscribed,
        undelivered,
        bounces: totals.bounces,
      },
      rates: {
        openPct: toPct(totals.opens, engagementBase),
        clickPct: toPct(totals.clicks, engagementBase),
        bouncePct: toPct(totals.bounces, sent),
        unsubPct: toPct(unsubscribed, engagementBase),
        spamPct: toPct(totals.spamReports, engagementBase, 2),
        undeliveredPct: toPct(undelivered, sent),
      },
      detailed: {
        requests: totals.requests,
        delivered: totals.delivered,
        opens: totals.opensTotal,
        uniqueOpens: totals.uniqueOpens,
        clicks: totals.clicksTotal,
        uniqueClicks: totals.uniqueClicks,
        unsubscribes: unsubscribed,
        bounces: totals.bounces,
        spamReports: totals.spamReports,
        blocks: totals.blocks,
        bounceDrops: totals.bounceDrops,
        spamReportDrops: totals.spamReportDrops,
        unsubscribeDrops: totals.unsubscribeDrops,
        invalidEmails: totals.invalidEmails,
        deferred: totals.deferred,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        message: "Unexpected error fetching SendGrid stats.",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
