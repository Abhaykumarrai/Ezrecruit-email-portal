const FREEMAIL_DOMAINS = new Set([
  "gmail.com",
  "googlemail.com",
  "yahoo.com",
  "yahoo.co.in",
  "yahoo.co.uk",
  "outlook.com",
  "hotmail.com",
  "live.com",
  "msn.com",
  "aol.com",
  "icloud.com",
  "me.com",
  "proton.me",
  "protonmail.com",
  "pm.me",
  "gmx.com",
  "zoho.com",
  "rediffmail.com",
  "yandex.com",
]);

const PLACEHOLDER_KEYS = new Set([
  "name",
  "email",
  "university",
  "custom1",
  "custom2",
  "designation",
  "unsubscribelink",
  "unsubscribe",
]);

export type RecipientFields = {
  name?: string;
  email?: string;
  university?: string;
  custom1?: string;
  custom2?: string;
};

export type AuthenticatedDomain = {
  domain: string;
  valid: boolean;
};

export type BrandedLink = {
  domain?: string;
  subdomain?: string;
  valid?: boolean;
};

export function normalizePlaceholderKey(key: string): string {
  return key.trim().toLowerCase().replace(/[\s_-]+/g, "");
}

export function emailDomain(email: string): string {
  const at = email.lastIndexOf("@");
  if (at < 0) return "";
  return email.slice(at + 1).trim().toLowerCase();
}

export function isFreemailDomain(domain: string): boolean {
  return FREEMAIL_DOMAINS.has(domain.trim().toLowerCase());
}

export function domainAligns(candidate: string, authenticatedDomain: string): boolean {
  const auth = authenticatedDomain.trim().toLowerCase().replace(/\.$/, "");
  const from = candidate.trim().toLowerCase();
  if (!auth || !from) return false;
  return from === auth || from.endsWith(`.${auth}`);
}

export function parseAsmGroupId(raw: string | undefined): { groupId: number | null; error: string | null } {
  const value = raw?.trim() ?? "";
  if (!value) return { groupId: null, error: null };
  if (!/^\d+$/.test(value)) {
    return {
      groupId: null,
      error: "SENDGRID_ASM_GROUP_ID must be the numeric id of a SendGrid unsubscribe group.",
    };
  }
  const groupId = Number(value);
  if (!Number.isSafeInteger(groupId) || groupId <= 0) {
    return {
      groupId: null,
      error: "SENDGRID_ASM_GROUP_ID must be the numeric id of a SendGrid unsubscribe group.",
    };
  }
  return { groupId, error: null };
}

/** Tag SendGrid replaces. ASM tags work only when asm.group_id is sent with the message. */
export function unsubscribeHref(groupId: number | null): string {
  return groupId ? "<%asm_group_unsubscribe_raw_url%>" : "<%unsubscribe%>";
}

export function applyPlaceholders(input: string, recipient: RecipientFields, href: string): string {
  const values: Record<string, string> = {
    name: recipient.name ?? "",
    email: recipient.email ?? "",
    university: recipient.university ?? "",
    custom1: recipient.custom1 ?? "",
    custom2: recipient.custom2 ?? "",
    designation: recipient.custom1 ?? "",
    unsubscribelink: href,
    unsubscribe: href,
  };
  return input.replace(/\{\{([^}]+)\}\}|\[([^\]]+)\]/g, (match, curly?: string, square?: string) => {
    const key = normalizePlaceholderKey(curly ?? square ?? "");
    if (!PLACEHOLDER_KEYS.has(key)) return match;
    return values[key] ?? "";
  });
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function ensureComplianceFooter(
  html: string,
  options: { unsubscribeHref: string; fromName: string; postalAddress: string }
): string {
  const href = options.unsubscribeHref;
  const hasUnsub = html.includes(href);
  const address = options.postalAddress.trim();
  const escapedAddress = address ? escapeHtml(address) : "";
  const hasAddress = Boolean(address) && (html.includes(address) || html.includes(escapedAddress));
  if (hasUnsub && (hasAddress || !address)) return html;

  const parts: string[] = [];
  if (address && !hasAddress) {
    parts.push(`<p style="margin:0 0 8px 0;">${escapedAddress}</p>`);
  }
  if (!hasUnsub) {
    parts.push(
      `<p style="margin:0;">You received this email from ${escapeHtml(options.fromName)}. <a href="${href}" style="color:#1155cc;text-decoration:underline;">Unsubscribe</a></p>`
    );
  }
  if (parts.length === 0) return html;
  return `${html}<div style="margin-top:28px;padding-top:14px;border-top:1px solid #e5e5e5;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.5;color:#666666;">${parts.join("")}</div>`;
}

export function htmlToPlainText(html: string): string {
  const tokens: string[] = [];
  const protectedHtml = html.replace(/<%[\s\S]*?%>/g, (tag) => {
    const token = `%%SG${tokens.length}%%`;
    tokens.push(tag);
    return token;
  });
  const text = protectedHtml
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<a\s+[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, (_match, href: string, labelHtml: string) => {
      const label = labelHtml.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
      return label ? `${label} (${href})` : href;
    })
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<\/h[1-6]>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return text.replace(/%%SG(\d+)%%/g, (_match, index: string) => tokens[Number(index)] ?? "");
}

export function envAllowedDomains(fromEmailEnv: string | undefined, extra: string | undefined): string[] {
  const domains: string[] = [];
  const primary = fromEmailEnv?.trim() ?? "";
  if (primary.includes("@")) {
    const domain = emailDomain(primary);
    if (domain) domains.push(domain);
  }
  for (const part of (extra ?? "").split(",")) {
    const domain = part.trim().toLowerCase().replace(/^@/, "");
    if (domain) domains.push(domain);
  }
  return [...new Set(domains)];
}

export function fromDomainBlockReason(
  fromEmail: string,
  domains: AuthenticatedDomain[] | null,
  envAllowedDomains: string[]
): string | null {
  const domain = emailDomain(fromEmail);
  if (!domain) return "A valid from email is required.";
  if (isFreemailDomain(domain)) {
    return `From address ${fromEmail} uses a free mailbox. Mail sent through SendGrid from Gmail, Outlook, Yahoo, and similar domains fails SPF and DKIM alignment, so mailbox providers file it as spam. Use an address on a domain authenticated in SendGrid.`;
  }
  if (domains) {
    const valid = domains.filter((entry) => entry.valid && entry.domain);
    const aligned = valid.some((entry) => domainAligns(domain, entry.domain));
    if (aligned) return null;
    const known = valid.map((entry) => entry.domain).join(", ");
    return known
      ? `From domain ${domain} is not an authenticated SendGrid domain. Send from ${known}, or authenticate ${domain} (SPF, DKIM, and a DMARC record) before sending.`
      : `SendGrid has no authenticated domain yet. Authenticate ${domain} (SPF, DKIM, and a DMARC record) before sending, or these messages will go to spam.`;
  }
  if (envAllowedDomains.length === 0) {
    return "Set SENDGRID_FROM_EMAIL to an address on your SendGrid-authenticated domain before sending.";
  }
  const aligned = envAllowedDomains.some((allowed) => domainAligns(domain, allowed));
  if (!aligned) {
    return `From domain ${domain} does not match the configured sending domain (${envAllowedDomains.join(", ")}). Use that domain so SPF and DKIM align with the From address.`;
  }
  return null;
}

export function linkBrandingCoversDomain(
  fromDomain: string,
  links: BrandedLink[] | null,
  forced: string | undefined
): boolean {
  const flag = forced?.trim().toLowerCase();
  if (flag === "1" || flag === "true" || flag === "yes" || flag === "on") return true;
  if (flag === "0" || flag === "false" || flag === "no" || flag === "off") return false;
  if (!links) return false;
  return links.some((link) => {
    if (!link.valid || !link.domain) return false;
    const host = link.subdomain ? `${link.subdomain}.${link.domain}` : link.domain;
    return domainAligns(fromDomain, link.domain) || domainAligns(host, fromDomain) || domainAligns(fromDomain, host);
  });
}

export function envFlag(raw: string | undefined, defaultValue: boolean): boolean {
  const flag = raw?.trim().toLowerCase();
  if (!flag) return defaultValue;
  if (flag === "1" || flag === "true" || flag === "yes" || flag === "on") return true;
  if (flag === "0" || flag === "false" || flag === "no" || flag === "off") return false;
  return defaultValue;
}
