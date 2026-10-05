import { NextResponse } from "next/server";

// Allow up to 60 seconds for sending large campaigns
export const maxDuration = 60;

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

function applyPlaceholders(input: string, recipient: RecipientPayload) {
  const normalize = (key: string) => key.trim().toLowerCase().replace(/[\s_-]+/g, "");
  const values: Record<string, string> = {
    name: recipient.name ?? "",
    email: recipient.email ?? "",
    university: recipient.university ?? "",
    custom1: recipient.custom1 ?? "",
    custom2: recipient.custom2 ?? "",
    designation: recipient.custom1 ?? "",
    unsubscribe_link: "<%asm_group_unsubscribe_raw_url%>",
    unsubscribe: "<%asm_group_unsubscribe_raw_url%>",
  };
  const getValue = (rawKey: string) => {
    const key = normalize(rawKey);
    if (key in values) return values[key];
    return "";
  };
  return input
    .replace(/\{\{([^}]+)\}\}/g, (_, key: string) => getValue(key))
    .replace(/\[([^\]]+)\]/g, (_, key: string) => getValue(key));
}

function htmlToPlainText(html: string): string {
  // Convert HTML to plain text for better deliverability
  return html
    .replace(/<style[^>]*>.*?<\/style>/gi, '')
    .replace(/<script[^>]*>.*?<\/script>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<\/h[1-6]>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\n\s*\n\s*\n/g, '\n\n')
    .trim();
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

    // Validate total attachment size (max 8MB)
    if (fileAttachments.length > 0) {
      const totalSize = fileAttachments.reduce((sum, att) => sum + att.content.length * 0.75, 0);
      if (totalSize > 8 * 1024 * 1024) {
        return NextResponse.json(
          { message: "Total attachment size exceeds 8MB. Please reduce the size of your attachments." },
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

    let sentCount = 0;
    let failedCount = 0;
    const failureReasons: string[] = [];
    const sentRecipients: typeof cleanedRecipients = [];

    for (const recipient of cleanedRecipients) {
      try {
        const personalizedSubject = applyPlaceholders(subject, recipient);
        const personalizedHtml = applyPlaceholders(html, recipient);
        const inline = extractInlineImageAttachments(personalizedHtml);
        
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
            subscription_tracking?: { enable: boolean };
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
            click_tracking: { enable: true, enable_text: false },
            open_tracking: { enable: true },
            subscription_tracking: { enable: true },
          },
          mail_settings: {
            bypass_list_management: { enable: false },
            footer: { enable: false },
            sandbox_mode: { enable: false },
          },
        };

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
        
        // Add small delay between sends to avoid rate limiting and improve deliverability
        if (cleanedRecipients.length > 10) {
          await new Promise(resolve => setTimeout(resolve, 100));
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
