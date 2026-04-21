/** Single campaign sample: exactly 50 sends — used for dashboard stats & activity. */

export const CAMPAIGN_DISPLAY_NAME = "Engineering Outreach Q2";

export const SENT_TOTAL = 50;

/** Counts that sum sensibly for one batch of 50 emails. */
export const email50 = {
  sent: 50,
  delivered: 48,
  opened: 17,
  clicked: 5,
  replied: 1,
  bounced: 1,
  unsubscribed: 0,
  spamReports: 0,
  undelivered: 1,
} as const;

function pct(part: number, whole: number, digits = 1) {
  if (whole <= 0) return "0";
  return ((100 * part) / whole).toFixed(digits);
}

export const rates50 = {
  openPct: Number(pct(email50.opened, email50.sent, 1)),
  clickPct: Number(pct(email50.clicked, email50.sent, 1)),
  replyPct: Number(pct(email50.replied, email50.sent, 1)),
  bouncePct: Number(pct(email50.bounced, email50.sent, 1)),
  unsubPct: Number(pct(email50.unsubscribed, email50.sent, 1)),
  spamPct: Number(pct(email50.spamReports, email50.sent, 2)),
  undeliveredPct: Number(pct(email50.undelivered, email50.sent, 1)),
};

export function formatInt(n: number) {
  return n.toLocaleString("en-IN");
}

const FIRST = [
  "Rahul",
  "Priya",
  "Arjun",
  "Sneha",
  "Vikram",
  "Ananya",
  "Karan",
  "Neha",
  "Dev",
  "Isha",
];
const LAST = [
  "Sharma",
  "Mehta",
  "Nair",
  "Patel",
  "Singh",
  "Roy",
  "Joshi",
  "Kapoor",
  "Agarwal",
  "Menon",
];
const CO = ["TechCorp", "StartupIO", "DesignCo", "BigCo", "SaaS.io", "RetailIN", "FinanceCo", "MediaTV"];

export type SampleRecipient = { name: string; email: string; company: string };

export const recipients50: SampleRecipient[] = Array.from({ length: SENT_TOTAL }, (_, i) => {
  const fn = FIRST[i % FIRST.length];
  const ln = LAST[(i + Math.floor(i / FIRST.length)) % LAST.length];
  return {
    name: `${fn} ${ln}`,
    email: `contact${i + 1}@ezrecruit-demo.io`,
    company: CO[i % CO.length],
  };
});

export type ActivityItem = { dot: string; text: string; sub: string };

export const activityFeed50: ActivityItem[] = [
  {
    dot: "bg-sky-500",
    text: `${recipients50[0].name} opened ${CAMPAIGN_DISPLAY_NAME}`,
    sub: `2 min ago · ${recipients50[0].email}`,
  },
  {
    dot: "bg-amber-500",
    text: `${recipients50[1].name} replied to ${CAMPAIGN_DISPLAY_NAME}`,
    sub: `14 min ago · ${recipients50[1].email}`,
  },
  {
    dot: "bg-emerald-500",
    text: `${recipients50[2].name} clicked a link in ${CAMPAIGN_DISPLAY_NAME}`,
    sub: `31 min ago · ${recipients50[2].email}`,
  },
  {
    dot: "bg-red-500",
    text: `Hard bounce — ${recipients50[47].email}`,
    sub: "1 hr ago",
  },
  {
    dot: "bg-zinc-600",
    text: `Campaign ${CAMPAIGN_DISPLAY_NAME} sent to ${SENT_TOTAL} contacts`,
    sub: "3 hrs ago",
  },
];
