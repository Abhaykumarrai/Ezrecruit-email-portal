import { NextResponse } from "next/server";
import sgMail from "@sendgrid/mail";

type RecipientPayload = {
  name?: string;
  email: string;
  company?: string;
  custom1?: string;
  custom2?: string;
};

type SendCampaignPayload = {
  fromName?: string;
  fromEmail?: string;
  replyToEmail?: string;
  subject?: string;
  html?: string;
  recipients?: RecipientPayload[];
};

const EMAIL_LIKE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;
const DATA_IMAGE_RE = /data:(image\/[a-zA-Z0-9.+-]+);base64,([A-Za-z0-9+/=]+)/g;

function applyPlaceholders(input: string, recipient: RecipientPayload) {
  const normalize = (key: string) => key.trim().toLowerCase().replace(/[\s_-]+/g, "");
  const values: Record<string, string> = {
    name: recipient.name ?? "",
    email: recipient.email ?? "",
    company: recipient.company ?? "",
    custom1: recipient.custom1 ?? "",
    custom2: recipient.custom2 ?? "",
    designation: recipient.custom1 ?? "",
    unsubscribe_link: "#",
  };
  const getValue = (rawKey: string) => {
    const key = normalize(rawKey);
    if (key in values) return values[key];
    if (key === "unsubscribe") return values.unsubscribe_link;
    return "";
  };
  return input
    .replace(/\{\{([^}]+)\}\}/g, (_, key: string) => getValue(key))
    .replace(/\[([^\]]+)\]/g, (_, key: string) => getValue(key));
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

    const payload = (await request.json()) as SendCampaignPayload;
    const fromEmail = payload.fromEmail?.trim() || process.env.SENDGRID_FROM_EMAIL?.trim();
    const fromName = payload.fromName?.trim() || process.env.SENDGRID_FROM_NAME?.trim() || "Email Team";
    const replyToEmail = payload.replyToEmail?.trim() || process.env.SENDGRID_REPLY_TO?.trim() || fromEmail;
    const subject = payload.subject?.trim() || "";
    const html = payload.html?.trim() || "";
    const recipients = payload.recipients ?? [];

    if (!fromEmail || !EMAIL_LIKE.test(fromEmail)) {
      return NextResponse.json({ message: "A valid from email is required." }, { status: 400 });
    }
    if (!replyToEmail || !EMAIL_LIKE.test(replyToEmail)) {
      return NextResponse.json({ message: "A valid reply-to email is required." }, { status: 400 });
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
        company: recipient.company?.trim() ?? "",
        custom1: recipient.custom1?.trim() ?? "",
        custom2: recipient.custom2?.trim() ?? "",
      }));

    if (cleanedRecipients.length === 0) {
      return NextResponse.json({ message: "No valid recipients found." }, { status: 400 });
    }

    sgMail.setApiKey(apiKey);

    let sentCount = 0;
    let failedCount = 0;
    const failureReasons: string[] = [];

    for (const recipient of cleanedRecipients) {
      try {
        const personalizedSubject = applyPlaceholders(subject, recipient);
        const personalizedHtml = applyPlaceholders(html, recipient);
        const inline = extractInlineImageAttachments(personalizedHtml);
        await sgMail.send({
          to: recipient.email,
          from: { email: fromEmail, name: fromName },
          replyTo: replyToEmail,
          subject: personalizedSubject,
          html: inline.html,
          attachments: inline.attachments,
        });
        sentCount += 1;
      } catch (error) {
        failedCount += 1;
        const messageFromSendGrid =
          error &&
          typeof error === "object" &&
          "response" in error &&
          error.response &&
          typeof error.response === "object" &&
          "body" in error.response &&
          error.response.body &&
          typeof error.response.body === "object" &&
          "errors" in error.response.body &&
          Array.isArray(error.response.body.errors) &&
          error.response.body.errors.length > 0 &&
          typeof error.response.body.errors[0]?.message === "string"
            ? String(error.response.body.errors[0].message)
            : error instanceof Error
              ? error.message
              : "Unknown send failure";
        if (failureReasons.length < 5) {
          failureReasons.push(messageFromSendGrid);
        }
      }
    }

    const status = sentCount > 0 ? 200 : 502;
    return NextResponse.json(
      {
        message:
          sentCount > 0
            ? "Campaign processed."
            : `SendGrid rejected all emails. ${failureReasons[0] ?? "Check sender verification and API key permissions."}`,
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
