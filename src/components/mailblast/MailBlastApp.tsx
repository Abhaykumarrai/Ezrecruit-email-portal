"use client";

import Image from "next/image";
import {
  activityFeed50,
  CAMPAIGN_DISPLAY_NAME,
  email50,
  formatInt,
  rates50,
} from "@/data/dashboard-sample-50";
import {
  useCallback,
  type DragEvent,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type ReactNode,
  type RefObject,
} from "react";
import { Btn, Card, CardHeader } from "./ui";

type PageId = "dashboard" | "metrics" | "compose" | "settings";

type ModalId = "sendConfirm" | null;

type RecipientPayload = {
  name: string;
  email: string;
  company: string;
  custom1: string;
  custom2: string;
};

type CampaignDraft = {
  fromName: string;
  fromEmail: string;
  replyToEmail: string;
  subject: string;
  html: string;
  recipients: RecipientPayload[];
};

type LiveDashboardStats = {
  totals: {
    sent: number;
    delivered: number;
    opens: number;
    clicks: number;
    spamReports: number;
    unsubscribed: number;
    undelivered: number;
    bounces: number;
  };
  rates: {
    openPct: number;
    clickPct: number;
    bouncePct: number;
    unsubPct: number;
    spamPct: number;
    undeliveredPct: number;
  };
  detailed: {
    requests: number;
    delivered: number;
    opens: number;
    uniqueOpens: number;
    clicks: number;
    uniqueClicks: number;
    unsubscribes: number;
    bounces: number;
    spamReports: number;
    blocks: number;
    bounceDrops: number;
    spamReportDrops: number;
    unsubscribeDrops: number;
    invalidEmails: number;
    deferred: number;
  };
};

const EMPTY_DASHBOARD_TOTALS: LiveDashboardStats["totals"] = {
  sent: 0,
  delivered: 0,
  opens: 0,
  clicks: 0,
  spamReports: 0,
  unsubscribed: 0,
  undelivered: 0,
  bounces: 0,
};

const EMPTY_DASHBOARD_RATES: LiveDashboardStats["rates"] = {
  openPct: 0,
  clickPct: 0,
  bouncePct: 0,
  unsubPct: 0,
  spamPct: 0,
  undeliveredPct: 0,
};

const EMPTY_DASHBOARD_DETAILED: LiveDashboardStats["detailed"] = {
  requests: 0,
  delivered: 0,
  opens: 0,
  uniqueOpens: 0,
  clicks: 0,
  uniqueClicks: 0,
  unsubscribes: 0,
  bounces: 0,
  spamReports: 0,
  blocks: 0,
  bounceDrops: 0,
  spamReportDrops: 0,
  unsubscribeDrops: 0,
  invalidEmails: 0,
  deferred: 0,
};

function statsActivityFeedFromTotals(totals: LiveDashboardStats["totals"]) {
  return [
    { dot: "bg-sky-500", text: `${formatInt(totals.opens)} unique opens in last 30 days`, sub: "SendGrid stats API" },
    {
      dot: "bg-red-500",
      text: `${formatInt(totals.undelivered)} undelivered in last 30 days`,
      sub: "bounces + blocks + deferred + drops",
    },
  ];
}

const PAGE_TITLES: Record<PageId, string> = {
  dashboard: "Dashboard",
  metrics: "Email activity",
  compose: "Compose Campaign",
  settings: "Settings",
};

type StatMetric = "sent" | "open" | "spam" | "unsubscribed" | "undelivered";

function NavBtn({
  id,
  label,
  Icon,
  page,
  setPage,
}: {
  id: PageId;
  label: string;
  Icon: NavIcon;
  page: PageId;
  setPage: (id: PageId) => void;
}) {
  const active = page === id || (id === "dashboard" && page === "metrics");
  return (
    <button
      type="button"
      onClick={() => setPage(id)}
      className={`mb-px flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] transition-colors ${
        active
          ? "bg-sky-500/15 font-medium text-sky-400"
          : "text-zinc-400 hover:bg-zinc-800/80 hover:text-zinc-100"
      }`}
    >
      <Icon className={`h-4 w-4 shrink-0 ${active ? "opacity-100" : "opacity-70"}`} />
      {label}
    </button>
  );
}

function NavIconDashboard({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" aria-hidden>
      <rect x="1" y="1" width="6" height="6" rx="1" fill="currentColor" opacity="0.8" />
      <rect x="9" y="1" width="6" height="6" rx="1" fill="currentColor" opacity="0.5" />
      <rect x="1" y="9" width="6" height="6" rx="1" fill="currentColor" opacity="0.5" />
      <rect x="9" y="9" width="6" height="6" rx="1" fill="currentColor" opacity="0.3" />
    </svg>
  );
}

function NavIconCompose({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" aria-hidden>
      <rect x="2" y="2" width="12" height="12" rx="2" stroke="currentColor" strokeWidth="1.2" />
      <path d="M5 6h6M5 9h4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

type NavIcon = ComponentType<{ className?: string }>;

const navMain: { id: PageId; label: string; Icon: NavIcon }[] = [
  { id: "dashboard", label: "Dashboard", Icon: NavIconDashboard },
  { id: "compose", label: "Compose", Icon: NavIconCompose },
];

function insertAtCursor(editor: HTMLDivElement | null, text: string) {
  if (!editor) return;
  editor.focus();
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) {
    editor.appendChild(document.createTextNode(text));
    return;
  }
  const range = sel.getRangeAt(0);
  if (!editor.contains(range.commonAncestorContainer)) {
    const r = document.createRange();
    r.selectNodeContents(editor);
    r.collapse(false);
    sel.removeAllRanges();
    sel.addRange(r);
  }
  const r = sel.getRangeAt(0);
  r.deleteContents();
  r.insertNode(document.createTextNode(text));
  r.collapse(false);
  sel.removeAllRanges();
  sel.addRange(r);
}

function focusEditorEnd(editor: HTMLDivElement | null) {
  if (!editor) return;
  editor.focus();
  const sel = window.getSelection();
  if (!sel) return;
  const range = document.createRange();
  range.selectNodeContents(editor);
  range.collapse(false);
  sel.removeAllRanges();
  sel.addRange(range);
}

function insertHtmlAtCursor(editor: HTMLDivElement | null, html: string) {
  if (!editor) return;
  focusEditorEnd(editor);
  document.execCommand("insertHTML", false, html);
}

function OpeningSplashMarketingStrip() {
  const igGradientId = `opening-splash-ig-${useId().replace(/:/g, "")}`;

  const channels: { label: string; node: ReactNode }[] = [
    {
      label: "Gmail",
      node: (
        <svg className="h-9 w-9 shrink-0" viewBox="0 0 24 24" aria-hidden>
          <path
            fill="#EA4335"
            d="M24 5.457v13.909c0 .904-.732 1.636-1.636 1.636h-4.909V11.73L12 16.64l-6.545-4.91v9.273H1.636A1.636 1.636 0 0 1 0 19.366V5.457c0-2.023 2.455-3.178 4.09-1.997L12 8.637l7.91-5.177c1.635-1.181 4.09-.026 4.09 1.997z"
          />
        </svg>
      ),
    },
    {
      label: "LinkedIn",
      node: (
        <svg className="h-9 w-9 shrink-0" viewBox="0 0 24 24" aria-hidden>
          <path
            fill="#0A66C2"
            d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 1 1 0-4.124 2.062 2.062 0 0 1 0 4.124zm1.782 13.019H3.555V9h3.564v11.452z"
          />
        </svg>
      ),
    },
    {
      label: "Meta",
      node: (
        <svg className="h-9 w-9 shrink-0" viewBox="0 0 24 24" aria-hidden>
          <path
            fill="#1877F2"
            d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"
          />
        </svg>
      ),
    },
    {
      label: "Instagram",
      node: (
        <svg className="h-9 w-9 shrink-0" viewBox="0 0 24 24" aria-hidden>
          <defs>
            <linearGradient id={igGradientId} x1="0%" y1="100%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#f09433" />
              <stop offset="45%" stopColor="#e6683c" />
              <stop offset="100%" stopColor="#bc1888" />
            </linearGradient>
          </defs>
          <path
            fill={`url(#${igGradientId})`}
            d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"
          />
        </svg>
      ),
    },
    {
      label: "X",
      node: (
        <svg className="h-8 w-8 shrink-0 text-white" viewBox="0 0 24 24" aria-hidden fill="currentColor">
          <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
        </svg>
      ),
    },
  ];

  return (
    <div
      className="relative z-10 mx-auto mt-8 flex max-w-lg flex-wrap items-center justify-center gap-5 sm:gap-6"
      style={{
        animation: "opening-splash-icons-row 0.75s cubic-bezier(0.22, 1, 0.36, 1) 0.45s both",
      }}
    >
      <span className="sr-only">Marketing channels: Gmail, LinkedIn, Meta, Instagram, and X.</span>
      {channels.map(({ label, node }, i) => (
        <div
          key={label}
          title={label}
          className="relative flex h-[56px] w-[56px] shrink-0 items-center justify-center rounded-2xl border border-white/25 bg-zinc-600 shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_14px_36px_rgba(0,0,0,0.65)]"
        >
          <div
            className="flex items-center justify-center"
            style={{
              animation: `opening-splash-icon-motion ${2.35 + (i % 3) * 0.32}s ease-in-out infinite`,
              animationDelay: `${0.55 + i * 0.1}s`,
            }}
          >
            {node}
          </div>
        </div>
      ))}
    </div>
  );
}

function OpeningSplash({ onFinish }: { onFinish: () => void }) {
  const [phase, setPhase] = useState<"in" | "out">("in");
  const finished = useRef(false);
  const onFinishRef = useRef(onFinish);
  onFinishRef.current = onFinish;

  const complete = useCallback(() => {
    if (finished.current) return;
    finished.current = true;
    setPhase("out");
    window.setTimeout(() => onFinishRef.current(), 480);
  }, []);

  useEffect(() => {
    const t = window.setTimeout(complete, 4200);
    return () => {
      window.clearTimeout(t);
    };
  }, [complete]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="EzRecruit ReachBox welcome"
      className={`fixed inset-0 z-[100] flex flex-col items-center justify-center bg-zinc-950 transition-opacity duration-[480ms] ease-in-out ${
        phase === "out" ? "pointer-events-none opacity-0" : "opacity-100"
      }`}
    >
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_50%_45%,rgba(14,165,233,0.16),transparent_55%)]"
        style={{ animation: "opening-splash-glow 2.8s ease-in-out infinite" }}
      />
      <div className="pointer-events-none absolute inset-x-0 top-1/3 h-px bg-gradient-to-r from-transparent via-sky-500/25 to-transparent" />

      <div className="relative z-10 px-6 text-center">
        <div className="flex flex-row flex-wrap items-baseline justify-center gap-0 text-[clamp(2rem,6vw,3.25rem)] font-bold italic leading-none tracking-tight">
          <span
            className="inline-block opacity-0 will-change-transform"
            style={{
              animation: "opening-splash-from-left 0.92s cubic-bezier(0.22, 1, 0.36, 1) 0.06s forwards",
            }}
          >
            <span className="bg-gradient-to-br from-sky-300 to-sky-500 bg-clip-text text-transparent">Ez</span>
          </span>
          <span
            className="inline-block opacity-0 will-change-transform"
            style={{
              animation: "opening-splash-from-right 0.92s cubic-bezier(0.22, 1, 0.36, 1) 0.14s forwards",
            }}
          >
            <span className="text-white">Recruit</span>
          </span>
        </div>

        <div className="mt-4 flex flex-row flex-wrap items-baseline justify-center gap-0 text-[clamp(1.35rem,4vw,2rem)] font-semibold italic tracking-tight">
          <span
            className="inline-block opacity-0 will-change-transform"
            style={{
              animation: "opening-splash-from-above 0.88s cubic-bezier(0.22, 1, 0.36, 1) 0.38s forwards",
            }}
          >
            <span className="bg-gradient-to-br from-sky-300 to-sky-500 bg-clip-text text-transparent">Reach</span>
          </span>
          <span
            className="inline-block opacity-0 will-change-transform"
            style={{
              animation: "opening-splash-from-below 0.88s cubic-bezier(0.22, 1, 0.36, 1) 0.5s forwards",
            }}
          >
            <span className="text-amber-100 drop-shadow-[0_0_24px_rgba(251,191,36,0.35)]">Box</span>
          </span>
        </div>

        <OpeningSplashMarketingStrip />

        <p className="mt-10 flex flex-wrap items-baseline justify-center gap-x-2.5 gap-y-1 px-2 text-[15px] font-semibold leading-snug tracking-wide text-zinc-100 drop-shadow-[0_2px_14px_rgba(0,0,0,0.85)] sm:text-[17px]">
          <span
            className="inline-block opacity-0 will-change-transform text-zinc-50"
            style={{
              animation: "opening-splash-from-bottom-left 0.75s cubic-bezier(0.22, 1, 0.36, 1) 1.05s forwards",
            }}
          >
            EzRecruit
          </span>
          <span
            className="inline-block opacity-0 will-change-transform text-sky-400"
            style={{
              animation: "opening-splash-from-above 0.75s cubic-bezier(0.22, 1, 0.36, 1) 1.14s forwards",
            }}
          >
            Marketing
          </span>
          <span
            className="inline-block opacity-0 will-change-transform text-zinc-200"
            style={{
              animation: "opening-splash-from-top-right 0.75s cubic-bezier(0.22, 1, 0.36, 1) 1.22s forwards",
            }}
          >
            Platform
          </span>
        </p>
      </div>
    </div>
  );
}

export function MailBlastApp() {
  const [openingSplash, setOpeningSplash] = useState(true);
  const [page, setPage] = useState<PageId>("dashboard");
  const [metricTab, setMetricTab] = useState<StatMetric>("sent");
  const [modal, setModal] = useState<ModalId>(null);
  const [campaignDraft, setCampaignDraft] = useState<CampaignDraft | null>(null);
  const [sendState, setSendState] = useState<"idle" | "sending" | "done" | "error">("idle");
  const [sendMessage, setSendMessage] = useState("");
  const [liveStats, setLiveStats] = useState<LiveDashboardStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [statsError, setStatsError] = useState("");
  const editorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    const loadStats = async () => {
      try {
        setStatsLoading(true);
        setStatsError("");
        const res = await fetch("/api/sendgrid/stats?days=30");
        const data = (await res.json()) as LiveDashboardStats & { message?: string };
        if (!res.ok) throw new Error(data.message || "Failed to load SendGrid stats.");
        if (!cancelled) setLiveStats(data);
      } catch (err) {
        if (!cancelled) {
          setStatsError(err instanceof Error ? err.message : "Failed to load SendGrid stats.");
          setLiveStats(null);
        }
      } finally {
        if (!cancelled) setStatsLoading(false);
      }
    };
    loadStats();
    return () => {
      cancelled = true;
    };
  }, []);

  const insertTag = useCallback((tag: string) => {
    insertAtCursor(editorRef.current, tag);
  }, []);

  return (
    <>
      {openingSplash ? <OpeningSplash onFinish={() => setOpeningSplash(false)} /> : null}
      <div className="flex h-full min-h-0 flex-1 overflow-hidden bg-zinc-950 font-sans text-zinc-100">
      <aside className="flex min-h-0 w-[220px] shrink-0 flex-col border-r border-zinc-800/80 bg-zinc-900">
        <div className="border-b border-zinc-800/80 px-[18px] pb-4 pt-5">
          <Image
            src="/ezrecruit-logo.png"
            alt="EzRecruit"
            width={200}
            height={48}
            priority
            className="h-9 w-auto max-w-full object-contain object-left"
          />
        </div>
        <nav className="flex flex-1 flex-col gap-0 overflow-y-auto px-2 py-3">
          <div className="px-2.5 pb-1 pt-2 text-[10px] font-medium uppercase tracking-wider text-zinc-500">Main</div>
          {navMain.map((n) => (
            <NavBtn key={n.id} {...n} page={page} setPage={setPage} />
          ))}
        </nav>
      </aside>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <header className="flex h-[52px] shrink-0 items-center border-b border-zinc-800/80 bg-zinc-900 px-6">
          <h1 className="min-w-0 flex-1 truncate text-[15px] font-medium text-zinc-100">
            {page === "metrics"
              ? `${PAGE_TITLES.metrics} · ${STAT_METRIC_LABEL[metricTab]}`
              : PAGE_TITLES[page]}
          </h1>
        </header>

        <main className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-6">
          {page === "dashboard" && (
            <DashboardView
              liveStats={liveStats}
              statsLoading={statsLoading}
              statsError={statsError}
              onOpenMetric={(m) => {
                setMetricTab(m);
                setPage("metrics");
              }}
            />
          )}
          {page === "metrics" && (
            <MetricEmailListView
              activeTab={metricTab}
              sentTotalHint={liveStats?.totals.sent ?? null}
              onTabChange={setMetricTab}
              onBack={() => setPage("dashboard")}
            />
          )}
          {page === "compose" && (
            <ComposeView
              insertTag={insertTag}
              editorRef={editorRef}
              onSend={(draft) => {
                setCampaignDraft(draft);
                setSendState("idle");
                setSendMessage("");
                setModal("sendConfirm");
              }}
            />
          )}
          {page === "settings" && <SettingsView />}
        </main>
      </div>

      {modal === "sendConfirm" && (
        <Modal title="Ready to send?" narrow onClose={() => setModal(null)}>
          {!campaignDraft ? (
            <p className="mb-4 text-[13px] text-red-300">Campaign details not found. Go back and click Send Campaign again.</p>
          ) : (
            <>
          <p className="mb-4 text-[13px] leading-relaxed text-zinc-400">
            You are about to send to <strong className="text-zinc-100">{formatInt(campaignDraft.recipients.length)} users</strong>{" "}
            via SendGrid. This cannot be undone.
          </p>
          {sendMessage ? (
            <div
              className={`mb-4 rounded-lg px-3.5 py-2.5 text-xs ${
                sendState === "error"
                  ? "border border-red-500/30 bg-red-500/10 text-red-200"
                  : "border border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
              }`}
            >
              {sendMessage}
            </div>
          ) : null}
          <div className="flex justify-end gap-2">
            <Btn size="sm" onClick={() => setModal(null)} disabled={sendState === "sending"}>
              {sendState === "done" ? "Close" : "Go back"}
            </Btn>
            {sendState !== "done" ? (
              <Btn
                size="sm"
                variant="primary"
                disabled={sendState === "sending"}
                onClick={async () => {
                  if (!campaignDraft) return;
                  try {
                    setSendState("sending");
                    setSendMessage("Sending campaign...");
                    const res = await fetch("/api/sendgrid/send-campaign", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify(campaignDraft),
                    });
                    const data = (await res.json()) as { message?: string; sentCount?: number; failedCount?: number };
                    if (!res.ok) {
                      throw new Error(data.message || "Unable to send campaign.");
                    }
                    setSendState("done");
                    setSendMessage(
                      `Campaign sent. Success: ${data.sentCount ?? 0}${data.failedCount ? `, Failed: ${data.failedCount}` : ""}.`
                    );
                  } catch (err) {
                    setSendState("error");
                    setSendMessage(err instanceof Error ? err.message : "Unable to send campaign.");
                  }
                }}
              >
                {sendState === "sending" ? "Sending..." : "Confirm & Send"}
              </Btn>
            ) : null}
          </div>
          </>
          )}
        </Modal>
      )}
    </div>
    </>
  );
}

function Modal({
  title,
  children,
  onClose,
  narrow,
  wide,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  narrow?: boolean;
  wide?: boolean;
}) {
  const maxW = narrow ? "max-w-[400px]" : wide ? "max-w-[min(96vw,56rem)]" : "max-w-[580px]";
  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 px-4 py-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={`max-h-[85vh] w-full overflow-y-auto rounded-2xl border border-zinc-700 bg-zinc-900 p-6 shadow-2xl ${maxW}`}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h2 id="modal-title" className="mb-[18px] text-base font-medium text-zinc-100">
          {title}
        </h2>
        {children}
      </div>
    </div>
  );
}

function Field({
  label,
  placeholder,
  defaultValue,
  type = "text",
}: {
  label: string;
  placeholder?: string;
  defaultValue?: string;
  type?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs text-zinc-400">{label}</span>
      <input
        type={type}
        placeholder={placeholder}
        defaultValue={defaultValue}
        className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-2.5 py-2 text-[13px] text-zinc-100 placeholder:text-zinc-600 outline-none focus:border-sky-600"
      />
    </label>
  );
}

function StatCard({
  label,
  value,
  sub,
  subClass,
  onClick,
}: {
  label: string;
  value: string;
  sub: string;
  subClass?: string;
  onClick?: () => void;
}) {
  const inner = (
    <>
      <div className="text-xs text-zinc-400">{label}</div>
      <div className="mt-1.5 text-2xl font-medium tracking-tight text-zinc-100">{value}</div>
      <div className={`mt-1 text-[11px] ${subClass ?? "text-zinc-500"}`}>{sub}</div>
    </>
  );
  const cls =
    "w-full rounded-xl bg-zinc-800/40 p-4 text-left ring-1 ring-zinc-800/80 transition-colors hover:bg-zinc-800/60 hover:ring-zinc-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/60";
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={cls} aria-label={`View details: ${label}`}>
        {inner}
      </button>
    );
  }
  return <div className={cls}>{inner}</div>;
}

function TableShell({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-[13px]">{children}</table>
    </div>
  );
}

function Th({ children }: { children: ReactNode }) {
  return (
    <th className="border-b border-zinc-800 px-3 py-2 text-left text-[11px] font-medium uppercase tracking-wide text-zinc-500">
      {children}
    </th>
  );
}

function Td({
  children,
  className = "",
  colSpan,
}: {
  children: ReactNode;
  className?: string;
  colSpan?: number;
}) {
  return (
    <td colSpan={colSpan} className={`border-b border-zinc-800/80 px-3 py-2.5 align-middle text-zinc-200 ${className}`}>
      {children}
    </td>
  );
}

const STAT_METRIC_LABEL: Record<StatMetric, string> = {
  sent: "Total sent",
  open: "Opens",
  spam: "Spam reports",
  unsubscribed: "Unsubscribes",
  undelivered: "Undelivered",
};

type EmailDetailRow = {
  name: string;
  email: string;
  sentAt: string;
  company: string;
  detail: string;
  opensCount?: number;
  clicksCount?: number;
  status?: string;
};

/** Rows derived from SendGrid Messages API (`/v3/messages`). */
function deriveRowsFromLive(metric: StatMetric, rows: EmailDetailRow[]): EmailDetailRow[] {
  switch (metric) {
    case "sent":
      return rows;
    case "open":
      return rows
        .filter((r) => (r.opensCount ?? 0) > 0)
        .map((r) => ({ ...r, detail: `Opened ${r.opensCount}x` }));
    case "undelivered":
      return rows
        .filter((r) => r.status === "not_delivered")
        .map((r) => ({ ...r, detail: r.detail || "Not delivered" }));
    default:
      return [];
  }
}

function formatSentDisplay(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** Calendar date in local timezone (matches `<input type="date">`). */
function localDateStringFromDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function localTodayString(): string {
  return localDateStringFromDate(new Date());
}

const METRIC_TABS: { id: StatMetric; label: string }[] = [
  { id: "sent", label: "Total sent" },
  { id: "open", label: "Opens" },
  { id: "spam", label: "Spam" },
  { id: "unsubscribed", label: "Unsubscribes" },
  { id: "undelivered", label: "Undelivered" },
];

function detailColumnHeader(metric: StatMetric): string {
  if (metric === "sent") return "Status";
  if (metric === "open") return "Open activity";
  if (metric === "spam") return "Spam flag";
  if (metric === "unsubscribed") return "Unsubscribe";
  return "Failure reason";
}

function MetricEmailListView({
  activeTab,
  sentTotalHint,
  onTabChange,
  onBack,
}: {
  activeTab: StatMetric;
  sentTotalHint: number | null;
  onTabChange: (m: StatMetric) => void;
  onBack: () => void;
}) {
  const [draftFrom, setDraftFrom] = useState(() => localTodayString());
  const [draftTo, setDraftTo] = useState(() => localTodayString());
  const [appliedFrom, setAppliedFrom] = useState(() => localTodayString());
  const [appliedTo, setAppliedTo] = useState(() => localTodayString());
  const [liveSentRows, setLiveSentRows] = useState<EmailDetailRow[]>([]);
  const [spamRows, setSpamRows] = useState<EmailDetailRow[]>([]);
  const [unsubRows, setUnsubRows] = useState<EmailDetailRow[]>([]);
  const [sentLoading, setSentLoading] = useState(true);
  const [sentError, setSentError] = useState("");
  const [supLoading, setSupLoading] = useState(true);
  const [supError, setSupError] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const fromDateRef = useRef<HTMLInputElement>(null);
  const toDateRef = useRef<HTMLInputElement>(null);

  const tabUsesMessages = activeTab === "sent" || activeTab === "open" || activeTab === "undelivered";
  const tabUsesSuppressions = activeTab === "spam" || activeTab === "unsubscribed";

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setSentLoading(true);
      setSupLoading(true);
      setSentError("");
      setSupError("");
      try {
        const [msgRes, supRes] = await Promise.all([
          fetch("/api/sendgrid/sent-emails?limit=10000"),
          fetch("/api/sendgrid/suppressions?limit=2000&days=365"),
        ]);
        const msgJson = (await msgRes.json()) as { rows?: EmailDetailRow[]; message?: string };
        const supJson = (await supRes.json()) as {
          spamRows?: EmailDetailRow[];
          unsubscribedRows?: EmailDetailRow[];
          message?: string;
        };

        if (!cancelled) {
          if (!msgRes.ok) {
            setSentError(msgJson.message || "Unable to fetch sent emails.");
            setLiveSentRows([]);
          } else {
            setLiveSentRows((msgJson.rows ?? []).filter((r) => !!r.email));
          }

          if (!supRes.ok) {
            setSupError(supJson.message || "Unable to fetch suppressions.");
            setSpamRows([]);
            setUnsubRows([]);
          } else {
            setSpamRows(supJson.spamRows ?? []);
            setUnsubRows(supJson.unsubscribedRows ?? []);
          }
        }
      } catch (err) {
        if (!cancelled) {
          const msg = err instanceof Error ? err.message : "Request failed.";
          setSentError(msg);
          setSupError(msg);
          setLiveSentRows([]);
          setSpamRows([]);
          setUnsubRows([]);
        }
      } finally {
        if (!cancelled) {
          setSentLoading(false);
          setSupLoading(false);
        }
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setPage(1);
  }, [activeTab]);

  const applyFilter = useCallback(() => {
    let from = draftFrom;
    let to = draftTo;
    if (!from?.trim() || !to?.trim()) return;
    if (from > to) [from, to] = [to, from];
    setAppliedFrom(from);
    setAppliedTo(to);
    setPage(1);
  }, [draftFrom, draftTo]);

  const openDatePicker = useCallback((ref: RefObject<HTMLInputElement | null>) => {
    const input = ref.current;
    if (!input) return;
    // Chromium supports showPicker for date inputs; fallback keeps behavior in other browsers.
    const withPicker = input as HTMLInputElement & { showPicker?: () => void };
    if (typeof withPicker.showPicker === "function") {
      withPicker.showPicker();
      return;
    }
    input.focus();
    input.click();
  }, []);

  const allRows = useMemo(() => {
    switch (activeTab) {
      case "sent":
        return liveSentRows;
      case "open":
      case "undelivered":
        return deriveRowsFromLive(activeTab, liveSentRows);
      case "spam":
        return spamRows;
      case "unsubscribed":
        return unsubRows;
      default:
        return [];
    }
  }, [activeTab, liveSentRows, spamRows, unsubRows]);

  const filtered = useMemo(() => {
    return allRows.filter((r) => {
      const day = r.sentAt.slice(0, 10);
      return day >= appliedFrom && day <= appliedTo;
    });
  }, [allRows, appliedFrom, appliedTo]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const paginatedRows = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, pageSize, safePage]);

  const detailHeader = detailColumnHeader(activeTab);
  const tabLoading = (tabUsesMessages && sentLoading) || (tabUsesSuppressions && supLoading);
  const loadingLabel = tabUsesSuppressions
    ? "Loading spam reports & unsubscribes..."
    : tabUsesMessages
      ? "loding matrics"
      : "Loading activity...";

  return (
    <div>
      <div className="mb-5">
        <button
          type="button"
          onClick={onBack}
          className="text-[13px] text-zinc-400 transition-colors hover:text-zinc-100"
        >
          ← Back to dashboard
        </button>
      </div>

      <div className="mb-5 flex gap-0 overflow-x-auto border-b border-zinc-800 pb-px [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {METRIC_TABS.map((tab) => {
          const on = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onTabChange(tab.id)}
              className={`shrink-0 border-b-2 px-3 py-2.5 text-[13px] transition-colors sm:px-4 ${
                on
                  ? "border-sky-500 font-medium text-sky-400"
                  : "border-transparent text-zinc-400 hover:text-zinc-200"
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {tabLoading ? (
        <LoadingStateCard title={loadingLabel} subtitle="Fetching latest data from SendGrid" minHeightClass="min-h-[55vh]" />
      ) : (
      <Card>
        {tabUsesMessages && (sentLoading || sentError) && (
          <div
            className={`mb-3 rounded-lg px-3 py-2 text-xs ${
              sentError ? "border border-amber-500/30 bg-amber-500/10 text-amber-200" : "border border-zinc-700 bg-zinc-900 text-zinc-400"
            }`}
          >
            {sentLoading ? "Loading Messages API data from SendGrid..." : sentError}
          </div>
        )}
        {tabUsesSuppressions && (supLoading || supError) && (
          <div
            className={`mb-3 rounded-lg px-3 py-2 text-xs ${
              supError ? "border border-amber-500/30 bg-amber-500/10 text-amber-200" : "border border-zinc-700 bg-zinc-900 text-zinc-400"
            }`}
          >
            {supLoading ? "Loading spam reports & unsubscribes from SendGrid..." : supError}
          </div>
        )}
        {activeTab === "sent" && !sentLoading && !sentError && sentTotalHint !== null && liveSentRows.length < sentTotalHint && (
          <div className="mb-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
            SendGrid aggregate stats show {formatInt(sentTotalHint)} sent, but Messages API returned {formatInt(liveSentRows.length)} rows.
            This usually means message activity retention/plan limits on SendGrid. For full historical recipient-level rows, store Event
            Webhook data in your database.
          </div>
        )}
        <div className="mb-4 flex flex-wrap items-end gap-3 border-b border-zinc-800 pb-4">
          <label className="block min-w-[220px]">
            <span className="mb-1.5 block text-xs text-zinc-400">From</span>
            <div className="flex items-stretch gap-1.5">
              <input
                ref={fromDateRef}
                type="date"
                value={draftFrom}
                onChange={(e) => setDraftFrom(e.target.value)}
                className="h-10 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-2.5 text-[13px] text-zinc-100 outline-none focus:border-sky-600"
              />
              <button
                type="button"
                onClick={() => openDatePicker(fromDateRef)}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-amber-400/60 bg-amber-400/15 text-amber-200 transition-colors hover:bg-amber-400/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
                title="Open calendar for From date"
                aria-label="Open calendar for From date"
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <rect x="3" y="5" width="18" height="16" rx="2" stroke="currentColor" strokeWidth="1.8" />
                  <path d="M8 3v4M16 3v4M3 10h18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                </svg>
              </button>
            </div>
          </label>
          <label className="block min-w-[220px]">
            <span className="mb-1.5 block text-xs text-zinc-400">To</span>
            <div className="flex items-stretch gap-1.5">
              <input
                ref={toDateRef}
                type="date"
                value={draftTo}
                onChange={(e) => setDraftTo(e.target.value)}
                className="h-10 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-2.5 text-[13px] text-zinc-100 outline-none focus:border-sky-600"
              />
              <button
                type="button"
                onClick={() => openDatePicker(toDateRef)}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-amber-400/60 bg-amber-400/15 text-amber-200 transition-colors hover:bg-amber-400/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
                title="Open calendar for To date"
                aria-label="Open calendar for To date"
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <rect x="3" y="5" width="18" height="16" rx="2" stroke="currentColor" strokeWidth="1.8" />
                  <path d="M8 3v4M16 3v4M3 10h18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                </svg>
              </button>
            </div>
          </label>
          <Btn
            size="sm"
            variant="primary"
            className="h-10 border-amber-400/70 bg-amber-400/80 px-4 text-zinc-950 hover:border-amber-300 hover:bg-amber-300"
            onClick={applyFilter}
          >
            Search
          </Btn>
        </div>

        <TableShell>
          <thead>
            <tr>
              <Th>Name</Th>
              <Th>Email</Th>
              <Th>Time sent</Th>
              <Th>Company</Th>
              <Th>{detailHeader}</Th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <Td className="py-8 text-center text-zinc-500" colSpan={5}>
                  {activeTab === "sent"
                    ? sentLoading
                      ? "Loading sent emails from SendGrid..."
                      : sentError
                        ? "Could not load messages. See notice above."
                        : "No sent emails found for this date range."
                    : activeTab === "spam"
                      ? supLoading
                        ? "Loading spam reports..."
                        : supError
                          ? "Could not load suppressions. See notice above."
                          : "No spam reports in this date range."
                      : activeTab === "unsubscribed"
                        ? supLoading
                          ? "Loading unsubscribes..."
                          : supError
                            ? "Could not load suppressions. See notice above."
                            : "No global unsubscribes in this date range."
                        : tabUsesMessages
                          ? sentLoading
                            ? "Loading message activity..."
                            : sentError
                              ? "Could not load messages. See notice above."
                              : "No matching rows in this date range. Enable open tracking on sends or widen dates."
                          : "No rows in this date range. Adjust the filter."}
                </Td>
              </tr>
            ) : (
              paginatedRows.map((r) => (
                <tr key={r.email + r.sentAt} className="hover:[&>td]:bg-zinc-800/40">
                  <Td>{r.name}</Td>
                  <Td className="font-mono text-xs text-zinc-300">{r.email}</Td>
                  <Td>{formatSentDisplay(r.sentAt)}</Td>
                  <Td>{r.company}</Td>
                  <Td className="text-zinc-400">{r.detail}</Td>
                </tr>
              ))
            )}
          </tbody>
        </TableShell>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-zinc-800 pt-3 text-xs text-zinc-500">
          <div>
            Showing{" "}
            <strong className="text-zinc-300">
              {filtered.length === 0 ? 0 : (safePage - 1) * pageSize + 1}-
              {Math.min(safePage * pageSize, filtered.length)}
            </strong>{" "}
            of <strong className="text-zinc-300">{filtered.length}</strong>
          </div>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1">
              <span>Rows</span>
              <select
                value={pageSize}
                onChange={(e) => setPageSize(Number(e.target.value))}
                className="rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-xs text-zinc-200 outline-none"
              >
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </label>
            <Btn size="sm" type="button" disabled={safePage <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
              Prev
            </Btn>
            <span className="px-1 text-zinc-400">
              {safePage}/{totalPages}
            </span>
            <Btn
              size="sm"
              type="button"
              disabled={safePage >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              Next
            </Btn>
          </div>
        </div>
      </Card>
      )}
    </div>
  );
}

function DashboardView({
  onOpenMetric,
  liveStats,
  statsLoading,
  statsError,
}: {
  onOpenMetric: (m: StatMetric) => void;
  liveStats: LiveDashboardStats | null;
  statsLoading: boolean;
  statsError: string;
}) {
  const useSampleDashboard = Boolean(statsError && !liveStats);

  const totals =
    liveStats?.totals ??
    (useSampleDashboard
      ? {
          sent: email50.sent,
          delivered: email50.delivered,
          opens: email50.opened,
          clicks: email50.clicked,
          spamReports: email50.spamReports,
          unsubscribed: email50.unsubscribed,
          undelivered: email50.undelivered,
          bounces: email50.bounced,
        }
      : EMPTY_DASHBOARD_TOTALS);

  const rates = liveStats?.rates ?? (useSampleDashboard ? rates50 : EMPTY_DASHBOARD_RATES);
  const detailed =
    liveStats?.detailed ??
    (useSampleDashboard
      ? {
          requests: email50.sent,
          delivered: email50.delivered,
          opens: email50.opened,
          uniqueOpens: email50.opened,
          clicks: email50.clicked,
          uniqueClicks: email50.clicked,
          unsubscribes: email50.unsubscribed,
          bounces: email50.bounced,
          spamReports: email50.spamReports,
          blocks: 0,
          bounceDrops: 0,
          spamReportDrops: 0,
          unsubscribeDrops: 0,
          invalidEmails: 0,
          deferred: 0,
        }
      : EMPTY_DASHBOARD_DETAILED);

  const openStr = `${rates.openPct}%`;
  const bounceStr = `${rates.bouncePct}%`;
  const unsubStr = `${rates.unsubPct}%`;
  const spamStr = totals.spamReports === 0 ? "0%" : `${rates.spamPct}%`;
  const undelStr = `${rates.undeliveredPct}%`;

  const activity = liveStats
    ? statsActivityFeedFromTotals(liveStats.totals)
    : useSampleDashboard
      ? activityFeed50
      : statsActivityFeedFromTotals(EMPTY_DASHBOARD_TOTALS);

  if (statsLoading) {
    return (
      <LoadingStateCard
        title="Loading SendGrid stats..."
        subtitle="Fetching latest dashboard metrics"
        minHeightClass="min-h-[65vh]"
      />
    );
  }

  return (
    <>
      {statsError && (
        <div
          className={`mb-4 rounded-lg px-3 py-2 text-xs ${
            statsError ? "border border-amber-500/30 bg-amber-500/10 text-amber-200" : "border border-zinc-700 bg-zinc-900 text-zinc-400"
          }`}
        >
          {`Using sample dashboard data. ${statsError}`}
        </div>
      )}
      <Card className="mb-6">
        <CardHeader title="Campaning stats" />
        <div className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-3 lg:grid-cols-5">
          {[
            { label: "Requests", value: detailed.requests, metric: "sent" as const },
            { label: "Delivered", value: detailed.delivered, metric: "sent" as const },
            { label: "Opens", value: detailed.opens, metric: "open" as const },
            { label: "Unique opens", value: detailed.uniqueOpens, metric: "open" as const },
            { label: "Unsubscribes", value: detailed.unsubscribes, metric: "unsubscribed" as const },
            { label: "Bounces", value: detailed.bounces, metric: "undelivered" as const },
            { label: "Spam reports", value: detailed.spamReports, metric: "spam" as const },
            { label: "Blocks", value: detailed.blocks, metric: "undelivered" as const },
            { label: "Bounce drops", value: detailed.bounceDrops, metric: "undelivered" as const },
            { label: "Spam report drops", value: detailed.spamReportDrops, metric: "spam" as const },
            { label: "Unsubscribe drops", value: detailed.unsubscribeDrops, metric: "undelivered" as const },
            { label: "Invalid emails", value: detailed.invalidEmails, metric: "undelivered" as const },
          ].map((item) => (
            <button
              key={item.label}
              type="button"
              onClick={() => onOpenMetric(item.metric)}
              className="rounded-lg border border-transparent p-2 text-left transition-colors hover:border-zinc-700 hover:bg-zinc-800/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600"
              title={`Open ${STAT_METRIC_LABEL[item.metric]} details`}
            >
              <span className="text-zinc-300">{item.label}</span>
              <div className="mt-1 font-semibold text-sky-300">{formatInt(item.value)}</div>
            </button>
          ))}
        </div>
      </Card>

      <Card className="mb-4">
        <CardHeader title="Engagement breakdown" />
        <ChartRow label="Opened" pct={rates.openPct} color="bg-sky-500" val={openStr} />
        <ChartRow label="Bounced" pct={rates.bouncePct} color="bg-red-500" val={bounceStr} />
        <ChartRow label="Unsubscribed" pct={Math.max(rates.unsubPct, 0.5)} color="bg-zinc-500" val={unsubStr} />
      </Card>

      <Card>
        <CardHeader title="Activity feed" />
        <ul className="flex flex-col">
          {activity.map((e, i, arr) => (
            <li key={i} className="relative flex gap-3 pb-4">
              {i < arr.length - 1 && (
                <span
                  className="absolute left-[5px] top-4 h-[calc(100%-8px)] w-px bg-zinc-800"
                  aria-hidden
                />
              )}
              <span className={`relative z-[1] mt-0.5 h-3 w-3 shrink-0 rounded-full ${e.dot}`} />
              <div>
                <div className="text-[13px] text-zinc-200">{renderBoldCampaign(e.text)}</div>
                <div className="text-[11px] text-zinc-500">{e.sub}</div>
              </div>
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}

function LoadingStateCard({ title, subtitle, minHeightClass = "min-h-[55vh]" }: { title: string; subtitle: string; minHeightClass?: string }) {
  return (
    <Card className={`flex items-center justify-center ${minHeightClass}`}>
      <div className="text-center">
        <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-2 border-zinc-700 border-t-sky-500" aria-hidden />
        <p className="text-sm font-medium text-zinc-200">{title}</p>
        <p className="mt-1 text-xs text-zinc-500">{subtitle}</p>
        <div className="mt-3 flex items-center justify-center gap-1.5" aria-hidden>
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-sky-500 [animation-delay:0ms]" />
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-sky-400 [animation-delay:150ms]" />
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-sky-300 [animation-delay:300ms]" />
        </div>
      </div>
    </Card>
  );
}

function renderBoldCampaign(text: string) {
  const names = [CAMPAIGN_DISPLAY_NAME, "Summer Sale 2025", "Onboarding Wave 3", "Re-engagement"];
  for (const n of names) {
    const idx = text.indexOf(n);
    if (idx !== -1) {
      return (
        <>
          {text.slice(0, idx)}
          <strong className="font-medium text-zinc-100">{n}</strong>
          {text.slice(idx + n.length)}
        </>
      );
    }
  }
  return text;
}

function ChartRow({ label, pct, color, val }: { label: string; pct: number; color: string; val: string }) {
  return (
    <div className="mb-2.5 flex items-center gap-2.5">
      <span className="w-[70px] shrink-0 text-xs text-zinc-400">{label}</span>
      <div className="h-2 flex-1 overflow-hidden rounded bg-zinc-800">
        <div className={`h-full rounded ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="w-10 text-right text-xs font-medium text-zinc-200">{val}</span>
    </div>
  );
}

function Step({
  n,
  label,
  state,
}: {
  n: string;
  label: string;
  state: "todo" | "active" | "done";
}) {
  return (
    <div
      className={`flex items-center gap-2 text-xs ${
        state === "active" ? "text-sky-400" : state === "done" ? "text-emerald-400/90" : "text-zinc-500"
      }`}
    >
      <span
        className={`flex h-6 w-6 items-center justify-center rounded-full border text-[11px] font-medium ${
          state === "active"
            ? "border-sky-500 bg-sky-600 text-white"
            : state === "done"
              ? "border-emerald-500/50 bg-emerald-500/15 text-emerald-400"
              : "border-zinc-700 text-zinc-500"
        }`}
      >
        {state === "done" ? "✓" : n}
      </span>
      <span>{label}</span>
    </div>
  );
}

function StepLine() {
  return <div className="mx-2 h-px flex-1 bg-zinc-800" />;
}

const EDITOR_HTML =
  "Hi {{name}},<br><br>We have an exciting offer just for you at {{company}}. As a valued customer, we are reaching out to share something special.<br><br>Click below to learn more!<br><br>Best regards,<br>The Team<br><br><span style=\"font-size:11px;color:#71717a\">Unsubscribe: {{unsubscribe_link}}</span>";

type PredefinedTemplate = {
  id: string;
  label: string;
  subject: string;
  body: string;
};

const PREDEFINED_TEMPLATES: PredefinedTemplate[] = [
  {
    id: "tracker-hours",
    label: "Template 1 · Tracker hours outreach",
    subject: "How many hours did your team spend on trackers today?",
    body: `Hi [Name],
Running a recruitment firm means your best people spend a chunk of every day doing things that aren't recruitment, updating trackers, reconciling feedback from team members and clients.
We spoke to founders and recruiters at 40+ agencies across India. The number that surprised us most: nearly 60% said tracker creation is non-productive manual work where recruiters end up spending hours every day.
Not the recruiter's fault. Just how it works without the right system in place.
Time is cost. If recruiters aren't doing research, it impacts your business outcome.
If this sounds familiar, I'd be happy to show you how recruitment agencies are fixing it. Would a quick 20-minute call this week make sense?
www.ezrecruit.ai

Best Regards,
Rajat Singh
Global Partnership Lead
Deeptalent Technologies Pvt.
+91 6300112759 | Rajat@deeptalent.in`,
  },
  {
    id: "scale-without-hiring",
    label: "Template 2 · Scale without more team",
    subject: "Scale your agency without scaling your team",
    body: `Hi [Name],
Most recruitment agency founders we speak to aren't looking to hire more recruiters. They're looking to get more out of the team they already have.
The challenge is that a significant part of every recruiter's day goes into work that isn't recruiting — building trackers, chasing feedback, repeating searches that have been done before.
We spoke to founders and recruiters at 40+ agencies across India. The finding was consistent: when you remove that operational drag, the same team delivers meaningfully more.
Not by working harder. By wasting less.
That's exactly what EzRecruit is built for — an ATS designed specifically for recruitment agencies, so your team spends more time placing candidates and less time managing spreadsheets.
If this sounds like something worth a closer look, I'd love to show you how it works. Would a quick 20-minute call this week make sense?
www.ezrecruit.ai
Best Regards,
Rajat Singh
Global Partnership Lead
Deeptalent Technologies Pvt.
+91 6300112759 | Rajat@deeptalent.in`,
  },
];

function templateTextToHtml(text: string) {
  return text
    .trim()
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\r?\n/g, "<br>");
}

type RecipientRow = {
  name: string;
  email: string;
  company: string;
  custom1: string;
  custom2: string;
};

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      q = !q;
      continue;
    }
    if (!q && c === ",") {
      out.push(cur.trim());
      cur = "";
      continue;
    }
    cur += c;
  }
  out.push(cur.trim());
  return out;
}

function normHeader(s: string) {
  return s.trim().toLowerCase().replace(/[\s_-]+/g, "");
}

const EMAIL_LIKE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;

function parseRecipientsCsv(text: string): { rows: RecipientRow[]; warnings: string[] } {
  const warnings: string[] = [];
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  if (!lines.length) return { rows: [], warnings: [] };

  if (!lines[0].includes(",")) {
    const rows: RecipientRow[] = [];
    let bad = 0;
    for (const line of lines) {
      if (EMAIL_LIKE.test(line)) {
        rows.push({ name: "", email: line, company: "", custom1: "", custom2: "" });
      } else bad++;
    }
    if (bad) warnings.push(`${bad} line(s) skipped — need a valid email per line when not using CSV.`);
    return { rows, warnings };
  }

  const first = parseCsvLine(lines[0]);
  const keys = first.map(normHeader);
  const hasHeader =
    keys.includes("email") ||
    keys.includes("e-mail") ||
    (keys.includes("name") && keys.length >= 2);

  let start = 0;
  let col = { name: 0, email: 1, company: 2, custom1: 3, custom2: 4 };

  if (hasHeader) {
    const idx = (aliases: string[], fallback: number) => {
      for (let i = 0; i < keys.length; i++) {
        if (aliases.includes(keys[i])) return i;
      }
      return fallback;
    };
    col = {
      name: idx(["name", "fullname", "full name"], 0),
      email: idx(["email", "e-mail", "mail"], 1),
      company: idx(["company", "organization", "org"], 2),
      custom1: idx(["custom1", "designation", "jobtitle", "title", "job"], 3),
      custom2: idx(["custom2", "industry"], 4),
    };
    start = 1;
  }

  const rows: RecipientRow[] = [];
  for (let i = start; i < lines.length; i++) {
    const cells = parseCsvLine(lines[i]);
    if (!cells.length) continue;
    const email = (cells[col.email] ?? "").trim() || (cells[0]?.includes("@") ? cells[0].trim() : "");
    if (!email) continue;
    if (!EMAIL_LIKE.test(email)) {
      warnings.push(`Skipped row ${i + 1}: invalid email "${email.slice(0, 40)}${email.length > 40 ? "…" : ""}"`);
      continue;
    }
    rows.push({
      name: (cells[col.name] ?? "").trim(),
      email,
      company: (cells[col.company] ?? "").trim(),
      custom1: (cells[col.custom1] ?? "").trim(),
      custom2: (cells[col.custom2] ?? "").trim(),
    });
  }

  if (!rows.length && lines.length > start) warnings.push("No valid rows found. Include an email column or one email per line.");
  return { rows, warnings };
}

function ComposeView({
  insertTag,
  editorRef,
  onSend,
}: {
  insertTag: (t: string) => void;
  editorRef: RefObject<HTMLDivElement | null>;
  onSend: (draft: CampaignDraft) => void;
}) {
  type ComposeStep = 1 | 2 | 3 | 4;
  const tags = ["{{name}}", "{{email}}", "{{company}}", "{{designation}}"];

  const [step, setStep] = useState<ComposeStep>(1);
  const [recipientRaw, setRecipientRaw] = useState("");
  const [recipientRows, setRecipientRows] = useState<RecipientRow[]>([]);
  const [recipientWarnings, setRecipientWarnings] = useState<string[]>([]);
  const [fromName, setFromName] = useState("");
  const [fromEmail, setFromEmail] = useState("");
  const [replyToEmail, setReplyToEmail] = useState("");
  const [subject, setSubject] = useState("");
  const [formError, setFormError] = useState("");
  const [showPreview, setShowPreview] = useState(false);
  const [previewSourceHtml, setPreviewSourceHtml] = useState("");
  const [editorHtml, setEditorHtml] = useState(EDITOR_HTML);
  const [isEditorLight, setIsEditorLight] = useState(false);
  const [showRecipientsModal, setShowRecipientsModal] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const csvFileRef = useRef<HTMLInputElement>(null);
  const editorImageRef = useRef<HTMLInputElement>(null);
  const editorHtmlRef = useRef<string>(EDITOR_HTML);
  const selectedImageRef = useRef<HTMLImageElement | null>(null);
  const draggingImageRef = useRef<HTMLImageElement | null>(null);
  const subjectInputRef = useRef<HTMLInputElement>(null);

  const loadRecipientsFromText = useCallback((raw: string) => {
    const { rows, warnings } = parseRecipientsCsv(raw);
    setRecipientRows(rows);
    setRecipientWarnings(warnings);
  }, []);

  const updateRecipientField = useCallback(
    (index: number, field: keyof RecipientRow, value: string) => {
      setRecipientRows((prev) => prev.map((row, i) => (i === index ? { ...row, [field]: value } : row)));
    },
    []
  );

  const deleteRecipientRow = useCallback((index: number) => {
    setRecipientRows((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const applySelectedTemplate = useCallback(() => {
    const picked = PREDEFINED_TEMPLATES.find((t) => t.id === selectedTemplateId);
    if (!picked) return;
    const html = templateTextToHtml(picked.body);
    setSubject(picked.subject);
    setShowPreview(false);
    setPreviewSourceHtml(html);
    setEditorHtml(html);
    editorHtmlRef.current = html;
    const editor = editorRef.current;
    if (editor) {
      editor.innerHTML = html;
    }
  }, [editorRef, selectedTemplateId]);

  const insertSubjectPlaceholder = useCallback((placeholder: string) => {
    const input = subjectInputRef.current;
    if (!input) {
      setSubject((prev) => `${prev}${placeholder}`);
      return;
    }
    const start = input.selectionStart ?? subject.length;
    const end = input.selectionEnd ?? subject.length;
    const next = `${subject.slice(0, start)}${placeholder}${subject.slice(end)}`;
    setSubject(next);
    requestAnimationFrame(() => {
      input.focus();
      const caret = start + placeholder.length;
      input.setSelectionRange(caret, caret);
    });
  }, [subject]);

  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    const initialHtml = editorHtml || EDITOR_HTML;
    if (el.innerHTML !== initialHtml) {
      el.innerHTML = initialHtml;
    }
  }, [editorHtml, editorRef]);

  const sendCampaign = useCallback(() => {
    const html = (editorRef.current?.innerHTML || editorHtml).trim();
    if (!fromEmail.trim() || !replyToEmail.trim()) {
      setFormError("From email and reply-to email are required.");
      return;
    }
    if (!subject.trim()) {
      setFormError("Subject line is required.");
      return;
    }
    if (!html) {
      setFormError("Email body cannot be empty.");
      return;
    }
    if (recipientRows.length === 0) {
      setFormError("Add at least one valid recipient before sending.");
      return;
    }
    setFormError("");
    onSend({
      fromName: fromName.trim() || "Team",
      fromEmail: fromEmail.trim(),
      replyToEmail: replyToEmail.trim(),
      subject: subject.trim(),
      html,
      recipients: recipientRows,
    });
  }, [editorHtml, editorRef, fromEmail, fromName, onSend, recipientRows, replyToEmail, subject]);

  const goNext = useCallback(() => {
    setFormError("");
    if (step === 3) {
      if (showPreview) {
        setEditorHtml(previewSourceHtml);
        editorHtmlRef.current = previewSourceHtml;
      } else {
        const html = editorRef.current?.innerHTML ?? "";
        setEditorHtml(html);
        editorHtmlRef.current = html;
      }
    }
    setStep((prev) => (prev < 4 ? ((prev + 1) as ComposeStep) : prev));
  }, [editorRef, previewSourceHtml, showPreview, step]);

  const goBack = useCallback(() => {
    setFormError("");
    setStep((prev) => (prev > 1 ? ((prev - 1) as ComposeStep) : prev));
  }, []);

  const stepState = (n: ComposeStep): "todo" | "active" | "done" => {
    if (step === n) return "active";
    if (step > n) return "done";
    return "todo";
  };
  const previewRecipient = useMemo<RecipientRow | null>(() => recipientRows[0] ?? null, [recipientRows]);

  const resolvePreviewPlaceholders = useCallback((input: string, row: RecipientRow) => {
    const normalize = (key: string) => key.trim().toLowerCase().replace(/[\s_-]+/g, "");
    const values: Record<string, string> = {
      name: row.name ?? "",
      email: row.email ?? "",
      company: row.company ?? "",
      custom1: row.custom1 ?? "",
      custom2: row.custom2 ?? "",
      designation: row.custom1 ?? "",
      unsubscribelink: "#",
      unsubscribe: "#",
    };
    const getValue = (rawKey: string) => values[normalize(rawKey)] ?? "";
    return input
      .replace(/\{\{([^}]+)\}\}/g, (_, key: string) => getValue(key))
      .replace(/\[([^\]]+)\]/g, (_, key: string) => getValue(key));
  }, []);
  const resolvedPreviewHtml = useMemo(() => {
    if (!previewRecipient) return "";
    return resolvePreviewPlaceholders(previewSourceHtml, previewRecipient);
  }, [previewRecipient, previewSourceHtml, resolvePreviewPlaceholders]);

  const editorPaneClass = isEditorLight
    ? "min-h-[180px] rounded-b-lg border border-zinc-300 bg-white px-3 py-3 text-[13px] leading-relaxed text-zinc-900 outline-none focus:border-sky-600"
    : "min-h-[180px] rounded-b-lg border border-zinc-700 bg-zinc-950 px-3 py-3 text-[13px] leading-relaxed text-zinc-200 outline-none focus:border-sky-600";

  const syncEditorHtml = useCallback(() => {
    requestAnimationFrame(() => {
      setEditorHtml(editorRef.current?.innerHTML || "");
    });
  }, [editorRef]);

  const flushEditorHtml = useCallback(() => {
    const html = editorRef.current?.innerHTML ?? "";
    setEditorHtml(html);
    editorHtmlRef.current = html;
  }, [editorRef]);

  const onToolbarClick = useCallback(
    (action: string) => {
      const editor = editorRef.current;
      if (!editor) return;
      editor.focus();
      if (action === "Preview") {
        flushEditorHtml();
        setPreviewSourceHtml(editor.innerHTML);
        setShowPreview((prev) => !prev);
        return;
      }
      setShowPreview(false);
      if (action === "B") {
        document.execCommand("bold");
        syncEditorHtml();
        return;
      }
      if (action === "I") {
        document.execCommand("italic");
        syncEditorHtml();
        return;
      }
      if (action === "U") {
        document.execCommand("underline");
        syncEditorHtml();
        return;
      }
      if (action === "H1") {
        document.execCommand("formatBlock", false, "h1");
        syncEditorHtml();
        return;
      }
      if (action === "H2") {
        document.execCommand("formatBlock", false, "h2");
        syncEditorHtml();
        return;
      }
      if (action === "Link") {
        const url = window.prompt("Enter link URL", "https://");
        if (!url) return;
        document.execCommand("createLink", false, url.trim());
        syncEditorHtml();
        return;
      }
      if (action === "Image") {
        editorImageRef.current?.click();
        return;
      }
      if (action === "Image -") {
        const image = selectedImageRef.current;
        if (!image) return;
        const current = parseInt(image.style.width || `${image.clientWidth || 320}`, 10);
        const next = Math.max(80, Math.round(current * 0.9));
        image.style.width = `${next}px`;
        image.style.height = "auto";
        flushEditorHtml();
        return;
      }
      if (action === "Image +") {
        const image = selectedImageRef.current;
        if (!image) return;
        const current = parseInt(image.style.width || `${image.clientWidth || 320}`, 10);
        const next = Math.min(1200, Math.round(current * 1.1));
        image.style.width = `${next}px`;
        image.style.height = "auto";
        flushEditorHtml();
        return;
      }
      if (action === "Button") {
        const buttonUrl = window.prompt("Enter button URL", "https://");
        if (!buttonUrl) return;
        const buttonText = window.prompt("Button text", "Learn more") || "Learn more";
        insertHtmlAtCursor(
          editor,
          `<a href="${buttonUrl.trim()}" target="_blank" rel="noopener noreferrer" style="display:inline-block;padding:10px 16px;background:#0284c7;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;">${buttonText}</a>`
        );
        syncEditorHtml();
        return;
      }
      if (action === "Divider") {
        insertHtmlAtCursor(editor, `<hr style="border:none;border-top:1px solid #3f3f46;margin:16px 0;" />`);
        syncEditorHtml();
        return;
      }
    },
    [editorRef, flushEditorHtml, syncEditorHtml]
  );

  const rangeFromPoint = useCallback((x: number, y: number) => {
    const doc = document as Document & {
      caretRangeFromPoint?: (cx: number, cy: number) => Range | null;
      caretPositionFromPoint?: (cx: number, cy: number) => { offsetNode: Node; offset: number } | null;
    };
    if (doc.caretRangeFromPoint) return doc.caretRangeFromPoint(x, y);
    if (doc.caretPositionFromPoint) {
      const pos = doc.caretPositionFromPoint(x, y);
      if (!pos) return null;
      const range = document.createRange();
      range.setStart(pos.offsetNode, pos.offset);
      range.collapse(true);
      return range;
    }
    return null;
  }, []);

  const onEditorDragStart = useCallback((e: DragEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    if (target.tagName !== "IMG") return;
    const img = target as HTMLImageElement;
    draggingImageRef.current = img;
    img.style.opacity = "0.6";
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", "email-editor-image");
  }, []);

  const onEditorDrop = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      const dragged = draggingImageRef.current;
      const editor = editorRef.current;
      if (!dragged || !editor) return;
      e.preventDefault();
      const dropRange = rangeFromPoint(e.clientX, e.clientY);
      if (!dropRange || !editor.contains(dropRange.commonAncestorContainer)) {
        dragged.style.opacity = "1";
        draggingImageRef.current = null;
        return;
      }
      dropRange.deleteContents();
      dropRange.insertNode(dragged);
      dropRange.setStartAfter(dragged);
      dropRange.collapse(true);
      const sel = window.getSelection();
      if (sel) {
        sel.removeAllRanges();
        sel.addRange(dropRange);
      }
      dragged.style.opacity = "1";
      draggingImageRef.current = null;
      selectedImageRef.current = dragged;
      flushEditorHtml();
    },
    [editorRef, flushEditorHtml, rangeFromPoint]
  );

  const onEditorDragEnd = useCallback(() => {
    const dragged = draggingImageRef.current;
    if (!dragged) return;
    dragged.style.opacity = "1";
    draggingImageRef.current = null;
  }, []);

  return (
    <>
      <input
        ref={editorImageRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          const reader = new FileReader();
          reader.onload = () => {
            const result = typeof reader.result === "string" ? reader.result : "";
            if (!result) return;
            insertHtmlAtCursor(
              editorRef.current,
              `<img src="${result}" alt="${file.name || "Campaign image"}" draggable="true" style="max-width:100%;height:auto;border-radius:8px;cursor:grab;" />`
            );
            syncEditorHtml();
          };
          reader.readAsDataURL(file);
          e.target.value = "";
        }}
      />
      <div className="mb-6 flex flex-wrap items-center gap-0">
        <Step n="1" label="Sender" state={stepState(1)} />
        <StepLine />
        <Step n="2" label="Recipients" state={stepState(2)} />
        <StepLine />
        <Step n="3" label="Template" state={stepState(3)} />
        <StepLine />
        <Step n="4" label="Review & Send" state={stepState(4)} />
      </div>

      {step === 1 && (
        <Card className="mb-4">
          <h3 className="mb-4 text-sm font-medium text-zinc-100">Sender & subject details</h3>
          <div className="mb-3.5 grid grid-cols-2 gap-3.5 max-sm:grid-cols-1">
            <label className="block">
              <span className="mb-1.5 block text-xs text-zinc-400">From name</span>
              <input
                type="text"
                value={fromName}
                onChange={(e) => setFromName(e.target.value)}
                placeholder="Enter sender name"
                className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-2.5 py-2 text-[13px] outline-none focus:border-sky-600"
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs text-zinc-400">From email</span>
              <input
                type="email"
                value={fromEmail}
                onChange={(e) => setFromEmail(e.target.value)}
                placeholder="Enter sender email"
                className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-2.5 py-2 text-[13px] outline-none focus:border-sky-600"
              />
            </label>
          </div>
          <div className="grid grid-cols-2 gap-3.5 max-sm:grid-cols-1">
            <label className="block">
              <span className="mb-1.5 block text-xs text-zinc-400">Reply-to email</span>
              <input
                type="email"
                value={replyToEmail}
                onChange={(e) => setReplyToEmail(e.target.value)}
                placeholder="Enter reply-to email"
                className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-2.5 py-2 text-[13px] outline-none focus:border-sky-600"
              />
            </label>
          </div>
        </Card>
      )}

      {step === 2 && (
        <Card className="mb-4">
        <h3 className="mb-1.5 text-sm font-medium text-zinc-100">Recipients</h3>
        <input
          ref={csvFileRef}
          type="file"
          accept=".csv,text/csv,text/plain"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            const reader = new FileReader();
            reader.onload = () => {
              const t = typeof reader.result === "string" ? reader.result : "";
              setRecipientRaw(t);
              loadRecipientsFromText(t);
            };
            reader.readAsText(f);
            e.target.value = "";
          }}
        />
        <div className="mb-3 flex flex-wrap gap-2">
          <Btn size="sm" type="button" onClick={() => csvFileRef.current?.click()}>
            Upload CSV
          </Btn>
          <Btn size="sm" type="button" onClick={() => window.open("/sample-recipients.csv", "_blank")}>
            Download sample CSV
          </Btn>
          <Btn size="sm" variant="primary" type="button" onClick={() => loadRecipientsFromText(recipientRaw)}>
            Load into table
          </Btn>
          <Btn
            size="sm"
            type="button"
            onClick={() => {
              setRecipientRaw("");
              setRecipientRows([]);
              setRecipientWarnings([]);
            }}
          >
            Clear
          </Btn>
        </div>
        {recipientWarnings.length > 0 && (
          <div className="mb-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
            {recipientWarnings.map((w, i) => (
              <div key={i}>{w}</div>
            ))}
          </div>
        )}
        <div className="mb-2 text-[11px] font-medium uppercase tracking-wide text-zinc-500">Preview</div>
        <div className="max-h-[280px] overflow-auto rounded-lg border border-zinc-800">
          <TableShell>
            <thead className="sticky top-0 z-[1] bg-zinc-900">
              <tr>
                <Th>Name</Th>
                <Th>Email</Th>
                <Th>Company</Th>
                <Th>Designation</Th>
                <Th>Actions</Th>
              </tr>
            </thead>
            <tbody>
              {recipientRows.length === 0 ? (
                <tr>
                  <Td colSpan={5} className="py-8 text-center text-zinc-500">
                    No recipients yet. Paste data and click <strong className="text-zinc-400">Load into table</strong>.
                  </Td>
                </tr>
              ) : (
                recipientRows.map((r, i) => (
                  <tr key={`recipient-row-${i}`} className="hover:[&>td]:bg-zinc-800/40">
                    <Td>
                      <input
                        type="text"
                        value={r.name}
                        onChange={(e) => updateRecipientField(i, "name", e.target.value)}
                        className="w-full min-w-[140px] rounded border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-[12px] text-zinc-100 outline-none focus:border-sky-600"
                        placeholder="Name"
                      />
                    </Td>
                    <Td className="font-mono text-xs text-zinc-300">
                      <input
                        type="email"
                        value={r.email}
                        onChange={(e) => updateRecipientField(i, "email", e.target.value)}
                        className="w-full min-w-[190px] rounded border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-[12px] text-zinc-100 outline-none focus:border-sky-600"
                        placeholder="Email"
                      />
                    </Td>
                    <Td>
                      <input
                        type="text"
                        value={r.company}
                        onChange={(e) => updateRecipientField(i, "company", e.target.value)}
                        className="w-full min-w-[130px] rounded border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-[12px] text-zinc-100 outline-none focus:border-sky-600"
                        placeholder="Company"
                      />
                    </Td>
                    <Td>
                      <input
                        type="text"
                        value={r.custom1}
                        onChange={(e) => updateRecipientField(i, "custom1", e.target.value)}
                        className="w-full min-w-[130px] rounded border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-[12px] text-zinc-100 outline-none focus:border-sky-600"
                        placeholder="Designation"
                      />
                    </Td>
                    <Td className="w-[96px]">
                      <Btn size="sm" type="button" onClick={() => deleteRecipientRow(i)}>
                        Delete
                      </Btn>
                    </Td>
                  </tr>
                ))
              )}
            </tbody>
          </TableShell>
        </div>
        </Card>
      )}

      {step === 3 && (
        <Card className="mb-4">
          <label className="mb-4 block">
            <span className="mb-1.5 block text-xs text-zinc-400">Use a predefined template</span>
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={selectedTemplateId}
                onChange={(e) => setSelectedTemplateId(e.target.value)}
                className="min-w-[280px] rounded-lg border border-zinc-700 bg-zinc-950 px-2.5 py-2 text-[13px] text-zinc-100 outline-none focus:border-sky-600"
              >
                <option value="">Select a template...</option>
                {PREDEFINED_TEMPLATES.map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.label}
                  </option>
                ))}
              </select>
              <Btn size="sm" variant="primary" type="button" onClick={applySelectedTemplate} disabled={!selectedTemplateId}>
                Load template
              </Btn>
            </div>
          </label>
          <label className="mb-4 block">
            <span className="mb-1.5 block text-xs text-zinc-400">Subject line (supports placeholders)</span>
            <div className="mb-2 flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] text-zinc-500">Insert field:</span>
              {["{{name}}", "{{email}}", "{{company}}", "{{designation}}"].map((field) => (
                <button
                  key={field}
                  type="button"
                  onClick={() => insertSubjectPlaceholder(field)}
                  className="rounded bg-sky-500/15 px-2 py-0.5 font-mono text-[11px] text-sky-300 transition-colors hover:bg-sky-500/25"
                >
                  {field}
                </button>
              ))}
            </div>
            <input
              ref={subjectInputRef}
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Enter subject (supports placeholders)"
              className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-2.5 py-2 text-[13px] outline-none focus:border-sky-600"
            />
          </label>
          <h3 className="mb-1.5 text-sm font-medium text-zinc-100">Email body</h3>
          <p className="mb-2.5 text-xs text-zinc-500">Click a placeholder to insert into editor</p>
          <div className="flex flex-wrap gap-1.5">
          {tags.map((t) => {
            return (
              <button
                key={t}
                type="button"
                onClick={() => {
                  insertTag(t);
                  syncEditorHtml();
                }}
                className="cursor-pointer rounded bg-sky-500/15 px-2 py-0.5 font-mono text-xs text-sky-300 transition-colors hover:bg-sky-500/25"
              >
              {t}
              </button>
            );
          })}
          </div>
          <div className="mt-3">
            <div className="flex flex-wrap gap-1 rounded-t-lg border border-b-0 border-zinc-700 bg-zinc-800/50 p-2">
              {["B", "I", "U", "H1", "H2", "Link", "Image", "Image -", "Image +", "Button", "Divider", "Preview"].map((b) => (
                <button
                  key={b}
                  type="button"
                  onClick={() => onToolbarClick(b)}
                  className={`rounded border border-transparent px-2 py-1 text-xs text-zinc-400 hover:border-zinc-700 hover:bg-zinc-900 ${
                    b === "B" ? "font-bold" : ""
                  } ${b === "I" ? "italic" : ""} ${b === "U" ? "underline" : ""}`}
                >
                  {b === "Preview" ? (showPreview ? "Edit" : "Preview") : b}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setIsEditorLight((prev) => !prev)}
                className="ml-auto rounded border border-zinc-700 px-2 py-1 text-xs text-zinc-300 hover:bg-zinc-900"
              >
                {isEditorLight ? "Dark" : "White"}
              </button>
            </div>
            {showPreview ? (
              <div
                className={editorPaneClass}
                dangerouslySetInnerHTML={{ __html: resolvedPreviewHtml }}
              />
            ) : (
              <div
                ref={editorRef}
                contentEditable
                suppressContentEditableWarning
                onDragStart={onEditorDragStart}
                onDragOver={(e) => {
                  if (draggingImageRef.current) e.preventDefault();
                }}
                onDrop={onEditorDrop}
                onDragEnd={onEditorDragEnd}
                onClick={(e) => {
                  const target = e.target as HTMLElement;
                  if (target.tagName === "IMG") {
                    selectedImageRef.current = target as HTMLImageElement;
                    return;
                  }
                  selectedImageRef.current = null;
                }}
                onInput={() => {
                  if (formError) setFormError("");
                  setEditorHtml(editorRef.current?.innerHTML || "");
                }}
                className={editorPaneClass}
              />
            )}
          </div>
        </Card>
      )}

      {step === 4 && (
        <Card className="mb-4">
          <h3 className="mb-4 text-sm font-medium text-zinc-100">Review & Send</h3>
          <div className="space-y-2 text-[13px] text-zinc-300">
            <div>
              From: <strong className="text-zinc-100">{fromName || "Team"}</strong> &lt;
              <span className="text-zinc-100">{fromEmail || "missing-from-email"}</span>&gt;
            </div>
            <div>
              Reply-to: <span className="text-zinc-100">{replyToEmail || "missing-reply-to"}</span>
            </div>
            <div>
              Subject:{" "}
              <span className="text-zinc-100">
                {previewRecipient
                  ? resolvePreviewPlaceholders(subject || "missing-subject", previewRecipient)
                  : (subject || "missing-subject")}
              </span>
            </div>
            <div>
              Recipients loaded:
              {" "}
              <button
                type="button"
                onClick={() => setShowRecipientsModal(true)}
                className="font-semibold text-sky-400 underline-offset-2 hover:underline"
              >
                {recipientRows.length}
              </button>
            </div>
          </div>
          <div className="mt-4 rounded-lg border border-zinc-700 bg-zinc-950">
            <div
              className="px-3 py-3 text-[13px] leading-relaxed text-zinc-200"
              dangerouslySetInnerHTML={{
                __html: previewRecipient ? resolvePreviewPlaceholders(editorHtml, previewRecipient) : editorHtml,
              }}
            />
          </div>
          {formError ? (
            <div className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">
              {formError}
            </div>
          ) : null}
          <div className="mt-4 flex justify-end gap-2.5">
            <Btn variant="primary" onClick={sendCampaign}>
              Send Campaign
            </Btn>
          </div>
        </Card>
      )}

      {showRecipientsModal && (
        <Modal title={`Recipients (${recipientRows.length})`} wide onClose={() => setShowRecipientsModal(false)}>
          {recipientRows.length === 0 ? (
            <p className="text-sm text-zinc-400">No recipients loaded.</p>
          ) : (
            <div className="max-h-[55vh] overflow-auto rounded-lg border border-zinc-800">
              <TableShell>
                <thead className="sticky top-0 z-[1] bg-zinc-900">
                  <tr>
                    <Th>Name</Th>
                    <Th>Email</Th>
                    <Th>Company</Th>
                    <Th>Designation</Th>
                  </tr>
                </thead>
                <tbody>
                  {recipientRows.map((r, i) => (
                    <tr key={`review-recipient-${i}`} className="hover:[&>td]:bg-zinc-800/40">
                      <Td>{r.name || "—"}</Td>
                      <Td className="font-mono text-xs text-zinc-300">{r.email}</Td>
                      <Td>{r.company || "—"}</Td>
                      <Td>{r.custom1 || "—"}</Td>
                    </tr>
                  ))}
                </tbody>
              </TableShell>
            </div>
          )}
          <div className="mt-4 flex justify-end">
            <Btn size="sm" onClick={() => setShowRecipientsModal(false)}>
              Close
            </Btn>
          </div>
        </Modal>
      )}

      <div className="flex items-center justify-between gap-2">
        <Btn size="sm" disabled={step === 1} onClick={goBack}>
          Back
        </Btn>
        {step < 4 ? (
          <Btn size="sm" variant="primary" onClick={goNext}>
            Next
          </Btn>
        ) : (
          <div />
        )}
      </div>
    </>
  );
}

function ToggleRow({ title, desc, defaultOn }: { title: string; desc: string; defaultOn?: boolean }) {
  const [on, setOn] = useState(!!defaultOn);
  return (
    <div className="flex items-center justify-between gap-4 border-b border-zinc-800 py-3.5 last:border-b-0">
      <div>
        <div className="text-[13px] font-medium text-zinc-100">{title}</div>
        <div className="text-xs text-zinc-500">{desc}</div>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        onClick={() => setOn(!on)}
        className={`relative h-5 w-9 shrink-0 cursor-pointer rounded-full transition-colors ${
          on ? "bg-sky-600" : "bg-zinc-700"
        }`}
      >
        <span
          className={`absolute top-0.5 h-3.5 w-3.5 rounded-full bg-white transition-[left] ${
            on ? "left-[19px]" : "left-0.5"
          }`}
        />
      </button>
    </div>
  );
}

function SettingsView() {
  return (
    <>
      <Card className="mb-4">
        <h3 className="mb-[18px] text-sm font-medium text-zinc-100">SendGrid API Configuration</h3>
        <label className="mb-3.5 block">
          <span className="mb-1.5 block text-xs text-zinc-400">SendGrid API Key</span>
          <input
            type="text"
            defaultValue="SG.••••••••••••••••••••••••••"
            className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-2.5 py-2 text-[13px] outline-none focus:border-sky-600"
          />
        </label>
        <div className="mb-3.5 grid grid-cols-2 gap-3.5 max-sm:grid-cols-1">
          <Field label="Default from name" placeholder="Ravi Kumar" />
          <label className="block">
            <span className="mb-1.5 block text-xs text-zinc-400">Default from email</span>
            <input
              type="email"
              defaultValue="ravi@mycompany.io"
              className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-2.5 py-2 text-[13px] outline-none focus:border-sky-600"
            />
          </label>
        </div>
        <label className="mb-1.5 block">
          <span className="mb-1.5 block text-xs text-zinc-400">Default reply-to email</span>
          <input
            type="email"
            defaultValue="replies@mycompany.io"
            className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-2.5 py-2 text-[13px] outline-none focus:border-sky-600"
          />
        </label>
        <div className="mt-2">
          <Btn size="sm" variant="primary">
            Save API Settings
          </Btn>
        </div>
      </Card>

      <Card className="mb-4">
        <h3 className="mb-4 text-sm font-medium text-zinc-100">Tracking & Webhooks</h3>
        <ToggleRow title="Open tracking" desc="Track when recipients open your emails" defaultOn />
        <ToggleRow title="Click tracking" desc="Track link clicks inside emails" defaultOn />
        <ToggleRow title="Reply tracking (Inbound Parse)" desc="Capture replies via SendGrid inbound parse" defaultOn />
        <ToggleRow title="Unsubscribe handling" desc="Auto-add {{unsubscribe_link}} to every email" defaultOn />
        <ToggleRow title="Bounce auto-removal" desc="Remove hard bounces from lists automatically" />
      </Card>

      <Card>
        <h3 className="mb-3.5 text-sm font-medium text-zinc-100">Custom placeholders</h3>
        <p className="mb-3 text-[13px] text-zinc-400">
          Define extra placeholder fields for your contacts. These map to columns in your CSV imports.
        </p>
        <div className="mb-3.5 grid grid-cols-2 gap-3.5 max-sm:grid-cols-1">
          <Field label="Placeholder 1 key" defaultValue="custom1" />
          <Field label="Label" defaultValue="Job Title" />
        </div>
        <div className="mb-3 grid grid-cols-2 gap-3.5 max-sm:grid-cols-1">
          <Field label="Placeholder 2 key" defaultValue="custom2" />
          <Field label="Label" defaultValue="Industry" />
        </div>
        <Btn size="sm" variant="primary">
          Save placeholders
        </Btn>
      </Card>
    </>
  );
}
