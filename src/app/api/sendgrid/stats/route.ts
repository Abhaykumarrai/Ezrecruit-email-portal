import { NextResponse } from "next/server";

type SendGridMetrics = {
  requests?: number;
  delivered?: number;
  opens?: number;
  clicks?: number;
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

  const sgUrl = `https://api.sendgrid.com/v3/stats?start_date=${startDate}&end_date=${endDate}&aggregated_by=day`;

  try {
    const response = await fetch(sgUrl, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      cache: "no-store",
    });

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
        const m = day.stats?.[0]?.metrics ?? {};
        acc.requests += m.requests ?? 0;
        acc.delivered += m.delivered ?? 0;
        acc.opens += m.opens ?? 0;
        acc.clicks += m.clicks ?? 0;
        acc.bounces += m.bounces ?? 0;
        acc.spamReports += m.spam_reports ?? 0;
        acc.unsubscribes += m.unsubscribes ?? 0;
        acc.blocks += m.blocks ?? 0;
        acc.invalidEmails += m.invalid_emails ?? 0;
        acc.deferred += m.deferred ?? 0;
        acc.bounceDrops += m.bounce_drops ?? 0;
        acc.spamReportDrops += m.spam_report_drops ?? 0;
        acc.unsubscribeDrops += m.unsubscribe_drops ?? 0;
        return acc;
      },
      {
        requests: 0,
        delivered: 0,
        opens: 0,
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

    return NextResponse.json({
      range: { startDate, endDate, days },
      totals: {
        sent,
        delivered: totals.delivered,
        opens: totals.opens,
        clicks: totals.clicks,
        replies: 0,
        spamReports: totals.spamReports,
        unsubscribed: totals.unsubscribes,
        undelivered,
        bounces: totals.bounces,
      },
      rates: {
        openPct: toPct(totals.opens, sent),
        clickPct: toPct(totals.clicks, sent),
        replyPct: 0,
        bouncePct: toPct(totals.bounces, sent),
        unsubPct: toPct(totals.unsubscribes, sent),
        spamPct: toPct(totals.spamReports, sent, 2),
        undeliveredPct: toPct(undelivered, sent),
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
