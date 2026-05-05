import { EventWebhook, EventWebhookHeader } from "@sendgrid/eventwebhook";

function normalizeVerificationKey(key: string): string {
  const trimmed = key.trim();
  if (!trimmed) return trimmed;
  if (/BEGIN\s+PUBLIC\s+KEY/i.test(trimmed)) return trimmed;
  const body = trimmed.replace(/\s+/g, "");
  const lines = body.match(/.{1,64}/g) ?? [body];
  return ["-----BEGIN PUBLIC KEY-----", ...lines, "-----END PUBLIC KEY-----"].join("\n");
}

function verifySignedWebhook(rawBody: string, headers: Headers): boolean {
  const key = (process.env.SENDGRID_VERIFICATION_KEY ?? "").trim();
  if (!key) return true;

  const signature = headers.get(EventWebhookHeader.SIGNATURE());
  const timestamp = headers.get(EventWebhookHeader.TIMESTAMP());
  if (!signature || !timestamp) return false;

  const tsNum = Number(timestamp);
  if (!Number.isFinite(tsNum)) return false;

  const tol = Number(process.env.WEBHOOK_TS_TOLERANCE_SEC) || 600;
  if (Math.abs(Date.now() / 1000 - tsNum) > tol) return false;

  const ew = new EventWebhook();
  let publicKey;
  try {
    publicKey = ew.convertPublicKeyToECDSA(normalizeVerificationKey(key));
  } catch {
    return false;
  }

  try {
    return ew.verifySignature(publicKey, rawBody, signature, timestamp);
  } catch {
    return false;
  }
}

function verifySharedSecret(request: Request): boolean {
  const secret = (process.env.WEBHOOK_SECRET ?? "").trim();
  if (!secret) return true;

  const header = request.headers.get("x-webhook-secret");
  const url = new URL(request.url);
  const q = url.searchParams.get("secret");
  return header === secret || q === secret;
}

/** Signed webhook key takes precedence when set. */
export function assertWebhookAuthorized(request: Request, rawBody: string): { ok: true } | { ok: false; status: number; error: string } {
  if ((process.env.SENDGRID_VERIFICATION_KEY ?? "").trim()) {
    if (!verifySignedWebhook(rawBody, request.headers)) {
      return { ok: false, status: 401, error: "Invalid SendGrid webhook signature" };
    }
    return { ok: true };
  }

  if (!verifySharedSecret(request)) {
    return { ok: false, status: 401, error: "Unauthorized" };
  }

  return { ok: true };
}
