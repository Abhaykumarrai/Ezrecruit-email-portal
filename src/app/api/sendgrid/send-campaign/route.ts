import { promises as dns } from "dns";
import { NextResponse } from "next/server";
import {
  applyPlaceholders,
  emailDomain,
  ensureComplianceFooter,
  envAllowedDomains,
  envFlag,
  fromDomainBlockReason,
  htmlToPlainText,
  isFreemailDomain,
  linkBrandingCoversDomain,
  parseAsmGroupId,
  unsubscribeHref,
  type AuthenticatedDomain,
  type BrandedLink,
} from "@/lib/emailDeliverability";

// Allow up to 60 seconds for sending large campaigns
export const maxDuration = 60;
export const runtime = "nodejs";

type RecipientPayload = {
  name?: string;
  email: string;
  university?: string;
  custom1?: string;
  custom2?: string;
};

type FileAttachment = {
  filename: string;
  content: string;
  type: string;
};

type SendCampaignPayload = {
  fromName?: string;
  fromEmail?: string;
  replyToEmail?: string;
  subject?: string;
  html?: string;
  recipients?: RecipientPayload[];
  attachments?: FileAttachment[];
};

const EMAIL_LIKE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;
const DATA_IMAGE_RE = /data:(image\/[a-zA-Z0-9.+-]+);base64,([A-Za-z0-9+/=]+)/g;
const SEND_GAP_MS = 500;

async function readSendGridList(
  apiKey: string,
  path: string
): Promise<{ rows: unknown[] } | { status: number }> {
  const res = await fetch(`https://api.sendgrid.com/v3${path}`, {
    headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) return { status: res.status };
  const body: unknown = await res.json();
  return { rows: Array.isArray(body) ? body : [] };
}

function asDomainRows(rows: unknown[]): AuthenticatedDomain[] {
  return rows.flatMap((row) => {
    if (!row || typeof row !== "object") return [];
    const domain = "domain" in row && typeof row.domain === "string" ? row.domain : "";
    const valid = "valid" in row && row.valid === true;
    return domain ? [{ domain, valid }] : [];
  });
}

function asBrandedLinks(rows: unknown[]): BrandedLink[] {
  return rows.flatMap((row) => {
    if (!row || typeof row !== "object") return [];
    const domain = "domain" in row && typeof row.domain === "string" ? row.domain : "";
    const subdomain = "subdomain" in row && typeof row.subdomain === "string" ? row.subdomain : undefined;
    const valid = "valid" in row && row.valid === true;
    return domain ? [{ domain, subdomain, valid }] : [];
  });
}

async function hasDmarcRecord(domain: string): Promise<boolean | null> {
  const labels = domain.split(".").filter(Boolean);
  const candidates = labels.length > 2 ? [domain, labels.slice(1).join(".")] : [domain];
  let sawUnknown = false;
  for (const candidate of candidates) {
    const found = await lookupDmarc(candidate);
    if (found === true) return true;
    if (found === null) sawUnknown = true;
  }
  return sawUnknown ? null : false;
}

async function lookupDmarc(domain: string): Promise<boolean | null> {
  try {
    const records = await Promise.race([
      dns.resolveTxt(`_dmarc.${domain}`),
      new Promise<never>((_, reject) => {
        setTimeout(() => reject(Object.assign(new Error("timeout"), { code: "ETIMEOUT" })), 3000);
      }),
    ]);
    return records.some((parts) => parts.join("").toLowerCase().includes("v=dmarc1"));
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === "ENOTFOUND" || code === "ENODATA") return false;
    return null;
  }
}

type InlineImageAttachment = {
  content: string;
  filename: string;
  type: string;
  disposition: "inline";
  content_id: string;
};

function extractInlineImageAttachments(html: string): { html: string; attachments: InlineImageAttachment[] } {
  const attachments: InlineImageAttachment[] = [];
  let index = 0;
  const transformedHtml = html.replace(DATA_IMAGE_RE, (_full, mimeType: string, base64: string) => {
    const ext = mimeType.split("/")[1]?.replace(/[^a-zA-Z0-9]/g, "") || "png";
    const contentId = `inline-image-${Date.now()}-${index}`;
    const filename = `inline-${index}.${ext}`;
    attachments.push({
      content: base64,
      filename,
      type: mimeType,
      disposition: "inline",
      content_id: contentId,
    });
    index += 1;
    return `cid:${contentId}`;
  });
  return { html: transformedHtml, attachments };
}

export async function POST(request: Request) {
  try {
    const apiKey = process.env.SENDGRID_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { message: "Missing SENDGRID_API_KEY. Add it to your environment before sending." },
        { status: 500 }
      );
    }

    let payload: SendCampaignPayload;
    try {
      payload = (await request.json()) as SendCampaignPayload;
    } catch (error) {
      return NextResponse.json(
        { message: "Invalid request payload. Request body may be too large (max 10MB). Try reducing attachment sizes." },
        { status: 413 }
      );
    }
    const fromEmail = payload.fromEmail?.trim() || process.env.SENDGRID_FROM_EMAIL?.trim();
    const fromName = payload.fromName?.trim() || process.env.SENDGRID_FROM_NAME?.trim() || "Email Team";
    const replyToEmailsRaw = payload.replyToEmail?.trim() || process.env.SENDGRID_REPLY_TO?.trim() || fromEmail || "";
    const subject = payload.subject?.trim() || "";
    const html = payload.html?.trim() || "";
    const recipients = payload.recipients ?? [];
    const fileAttachments = payload.attachments ?? [];

    if (fileAttachments.length > 0) {
      const totalSize = fileAttachments.reduce((sum, att) => sum + att.content.length * 0.75, 0);
      if (totalSize > 3 * 1024 * 1024) {
        return NextResponse.json(
          { message: "Total attachment size exceeds 3MB. Please reduce the size of your attachments." },
          { status: 413 }
        );
      }
    }

    // Parse multiple reply-to emails (comma-separated)
    const replyToEmails = replyToEmailsRaw
      .split(",")
      .map((e) => e.trim())
      .filter((e) => e && EMAIL_LIKE.test(e));

    if (!fromEmail || !EMAIL_LIKE.test(fromEmail)) {
      return NextResponse.json({ message: "A valid from email is required." }, { status: 400 });
    }
    if (replyToEmails.length === 0) {
      return NextResponse.json({ message: "At least one valid reply-to email is required." }, { status: 400 });
    }
    if (!subject) {
      return NextResponse.json({ message: "Subject is required." }, { status: 400 });
    }
    if (!html) {
      return NextResponse.json({ message: "Email body is required." }, { status: 400 });
    }
    if (!Array.isArray(recipients) || recipients.length === 0) {
      return NextResponse.json({ message: "At least one recipient is required." }, { status: 400 });
    }
    if (recipients.length > 500) {
      return NextResponse.json({ message: "Recipient limit exceeded. Send up to 500 at once." }, { status: 400 });
    }

    const cleanedRecipients = recipients
      .filter((recipient) => recipient?.email && EMAIL_LIKE.test(recipient.email))
      .map((recipient) => ({
        name: recipient.name?.trim() ?? "",
        email: recipient.email.trim(),
        university: recipient.university?.trim() ?? "",
        custom1: recipient.custom1?.trim() ?? "",
        custom2: recipient.custom2?.trim() ?? "",
      }));

    if (cleanedRecipients.length === 0) {
      return NextResponse.json({ message: "No valid recipients found." }, { status: 400 });
    }

    const asm = parseAsmGroupId(process.env.SENDGRID_ASM_GROUP_ID);
    if (asm.error) {
      return NextResponse.json({ message: asm.error }, { status: 400 });
    }
    const fromDomain = emailDomain(fromEmail);
    if (isFreemailDomain(fromDomain)) {
      return NextResponse.json(
        {
          message: `From address ${fromEmail} uses a free mailbox. Mail sent through SendGrid from Gmail, Outlook, Yahoo, and similar domains fails SPF and DKIM alignment, so mailbox providers file it as spam. Use an address on a domain authenticated in SendGrid.`,
        },
        { status: 400 }
      );
    }

    let authenticatedDomains: AuthenticatedDomain[] | null = null;
    let brandedLinks: BrandedLink[] | null = null;
    try {
      const [domainResult, linkResult] = await Promise.all([
        readSendGridList(apiKey, "/whitelabel/domains"),
        readSendGridList(apiKey, "/whitelabel/links"),
      ]);
      if ("rows" in domainResult) authenticatedDomains = asDomainRows(domainResult.rows);
      if ("rows" in linkResult) brandedLinks = asBrandedLinks(linkResult.rows);
    } catch (error) {
      console.error("[send-campaign] Could not read SendGrid sender authentication", error);
    }

    const domainBlock = fromDomainBlockReason(
      fromEmail,
      authenticatedDomains,
      envAllowedDomains(process.env.SENDGRID_FROM_EMAIL, process.env.SENDGRID_ALLOWED_FROM_DOMAINS)
    );
    if (domainBlock) {
      return NextResponse.json({ message: domainBlock }, { status: 400 });
    }

    const dmarc = await hasDmarcRecord(fromDomain);
    if (dmarc === false) {
      return NextResponse.json(
        {
          message: `From domain ${fromDomain} has no DMARC record. Add a TXT record on _dmarc.${fromDomain} with: v=DMARC1; p=none; rua=mailto:${fromEmail}`,
        },
        { status: 400 }
      );
    }

    const href = unsubscribeHref(asm.groupId);
    const clickTracking = linkBrandingCoversDomain(fromDomain, brandedLinks, process.env.SENDGRID_LINK_BRANDING);
    const openTracking = envFlag(process.env.SENDGRID_OPEN_TRACKING, true);
    const postalAddress = process.env.SENDGRID_POSTAL_ADDRESS?.trim() ?? "";

    let sentCount = 0;
    let failedCount = 0;
    const failureReasons: string[] = [];
    const sentRecipients: typeof cleanedRecipients = [];
    const sharedInline = extractInlineImageAttachments(html);

    for (let index = 0; index < cleanedRecipients.length; index += 1) {
      const recipient = cleanedRecipients[index];
      try {
        const personalizedSubject = applyPlaceholders(subject, recipient, href);
        const personalizedHtml = ensureComplianceFooter(applyPlaceholders(sharedInline.html, recipient, href), {
          unsubscribeHref: href,
          fromName,
          postalAddress,
        });
        const inline = { html: personalizedHtml, attachments: sharedInline.attachments };
        
        type SendGridAttachment = {
          content: string;
          filename: string;
          type: string;
          disposition: "inline" | "attachment";
          content_id?: string;
        };
        
        // Generate plain text version for better deliverability
        const plainTextContent = htmlToPlainText(inline.html);

        const mailSendBody: {
          personalizations: Array<{ to: Array<{ email: string; name?: string }> }>;
          from: { email: string; name: string };
          reply_to_list?: Array<{ email: string }>;
          reply_to?: { email: string };
          subject: string;
          content: Array<{ type: string; value: string }>;
          categories?: string[];
          custom_args?: Record<string, string>;
          attachments?: SendGridAttachment[];
          tracking_settings?: {
            click_tracking?: { enable: boolean; enable_text: boolean };
            open_tracking?: { enable: boolean };
            subscription_tracking?: { enable: boolean; substitution_tag?: string };
          };
          mail_settings?: {
            bypass_list_management?: { enable: boolean };
            footer?: { enable: boolean };
            sandbox_mode?: { enable: boolean };
          };
          asm?: {
            group_id?: number;
          };
        } = {
          personalizations: [
            {
              to: [{ email: recipient.email, name: recipient.name || undefined }],
            },
          ],
          from: { email: fromEmail, name: fromName },
          subject: personalizedSubject,
          content: [
            { type: "text/plain", value: plainTextContent },
            { type: "text/html", value: inline.html }
          ],
          categories: ["ezrecruit-email-portal"],
          custom_args: { app: "ezrecruit-email-portal" },
          tracking_settings: {
            click_tracking: { enable: clickTracking, enable_text: false },
            open_tracking: { enable: openTracking },
            subscription_tracking: asm.groupId
              ? { enable: false }
              : { enable: true, substitution_tag: href },
          },
          mail_settings: {
            bypass_list_management: { enable: false },
            footer: { enable: false },
            sandbox_mode: { enable: false },
          },
        };
        if (asm.groupId) {
          mailSendBody.asm = { group_id: asm.groupId };
        }

        // Use reply_to_list for multiple addresses, or reply_to for single
        if (replyToEmails.length > 1) {
          mailSendBody.reply_to_list = replyToEmails.map((email) => ({ email }));
        } else {
          mailSendBody.reply_to = { email: replyToEmails[0] };
        }

        // Combine inline images and file attachments
        const allAttachments: SendGridAttachment[] = [
          ...inline.attachments,
          ...fileAttachments.map((file) => ({
            content: file.content,
            filename: file.filename,
            type: file.type,
            disposition: "attachment" as const,
          })),
        ];

        if (allAttachments.length > 0) {
          mailSendBody.attachments = allAttachments;
        }

        const response = await fetch("https://api.sendgrid.com/v3/mail/send", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(mailSendBody),
          cache: "no-store",
        });

        if (!response.ok) {
          const text = await response.text();
          let message = `Mail Send API HTTP ${response.status}`;
          try {
            const parsed = JSON.parse(text) as { errors?: Array<{ message?: string }> };
            const fromApi = parsed.errors?.[0]?.message;
            if (fromApi) message = fromApi;
          } catch {
            /* keep fallback message */
          }
          throw new Error(message);
        }

        sentCount += 1;
        sentRecipients.push(recipient);

        if (index < cleanedRecipients.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, SEND_GAP_MS));
        }
      } catch (error) {
        failedCount += 1;
        const messageFromSendGrid = error instanceof Error ? error.message : "Unknown send failure";
        if (failureReasons.length < 5) {
          failureReasons.push(messageFromSendGrid);
        }
      }
    }

    if (sentRecipients.length > 0) {
      try {
        const { getEmailSendsCollection, isMongoConfigured } = await import("@/lib/sendgridWebhook/mongo");
        if (isMongoConfigured()) {
          const coll = await getEmailSendsCollection();
          const now = new Date();
          const sentAtUnix = Math.floor(now.getTime() / 1000);
          await coll.insertMany(
            sentRecipients.map((recipient) => ({
              email: recipient.email,
              name: recipient.name ?? "",
              university: recipient.university ?? "",
              custom1: recipient.custom1 ?? "",
              custom2: recipient.custom2 ?? "",
              subject,
              sentAt: now.toISOString(),
              sentAtUnix,
              source: "ezrecruit-email-portal",
            }))
          );
        }
      } catch (err) {
        console.error("[send-campaign] Failed to persist sent recipients", err);
      }
    }

    const firstFailure = failureReasons[0] ?? "";
    const lowerFirstFailure = firstFailure.toLowerCase();
    const creditsExhausted =
      lowerFirstFailure.includes("maximum credits exceeded") ||
      lowerFirstFailure.includes("credits exceeded") ||
      lowerFirstFailure.includes("credit balance");

    const status = sentCount > 0 ? 200 : creditsExhausted ? 402 : 502;
    return NextResponse.json(
      {
        message:
          sentCount > 0
            ? "Campaign processed."
            : creditsExhausted
              ? "SendGrid Mail Send API is active, but your account sending credits are exhausted. Upgrade/add credits in SendGrid billing and retry."
              : `SendGrid rejected all emails. ${firstFailure || "Check sender verification and API key permissions."}`,
        sentCount,
        failedCount,
        failureReasons,
      },
      { status }
    );
  } catch {
    return NextResponse.json({ message: "Invalid request payload." }, { status: 400 });
  }
}
