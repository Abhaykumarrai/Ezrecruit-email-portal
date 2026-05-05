# SendGrid Event Webhook server

Tiny **Express + MongoDB** service that receives SendGrid Event Webhook POSTs and stores them in `email_events` with deduplication.

## Prerequisites

- Node.js 18+
- MongoDB (local or [MongoDB Atlas](https://www.mongodb.com/cloud/atlas))

## Setup

```bash
cd sendgrid-webhook-server
cp .env.example .env
# Edit .env: DATABASE_URL, optional WEBHOOK_SECRET, PORT
npm install
npm start
```

Development with auto-restart (Node 18+):

```bash
npm run dev
```

## Environment

| Variable | Required | Description |
|----------|----------|-------------|
| `PORT` | No | Default `3001` |
| `MONGODB_HOST` | One of… | Atlas hostname only, e.g. `cluster0.xxxxx.mongodb.net` |
| `MONGODB_USER` | …these three | Database Access username |
| `MONGODB_PASSWORD` | …plain password | No angle brackets; special chars OK (encoded automatically) |
| `MONGODB_APP_NAME` | No | Default `sendgrid-webhook` |
| `DATABASE_URL` | …or this | Full URI if you prefer (must encode special chars in password yourself) |
| `DATABASE_NAME` | No | Database name (default `email_webhooks`) |
| `SENDGRID_VERIFICATION_KEY` | Recommended | Verification Key from SendGrid Event Webhook (“Signed Event Webhook”). Verifies official Twilio headers. |
| `WEBHOOK_TS_TOLERANCE_SEC` | No | Signed webhook clock skew tolerance (default `600`). |
| `WEBHOOK_SECRET` | No | If **no** verification key, optionally require `X-Webhook-Secret` **or** `?secret=` |

If **`MONGODB_HOST`**, **`MONGODB_USER`**, and **`MONGODB_PASSWORD`** are all set, they **override** `DATABASE_URL`.

### Signed Event Webhook (SendGrid)

If you enable **Signed Event Webhook** in SendGrid (recommended):

1. Copy the **Verification Key** from the Event Webhook settings.
2. Put it in `.env` as **`SENDGRID_VERIFICATION_KEY`** (paste the whole line; PEM wrapping is applied automatically if needed).
3. Restart the server.

Incoming POSTs must include `X-Twilio-Email-Event-Webhook-Signature` and `X-Twilio-Email-Event-Webhook-Timestamp` (SendGrid adds these automatically). **Test Integration** in SendGrid uses the same signing flow.

## Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/health` | Liveness |
| POST | `/sendgrid/events` | SendGrid webhook (JSON array body) |
| GET | `/events?limit=50&email=&event=` | List stored events (no auth — lock down in production) |

## Configure SendGrid Event Webhook

1. SendGrid Dashboard → **Settings** → **Mail Settings** → **Event Webhook**.
2. Enable the webhook.
3. **HTTP POST URL**: your public URL, e.g. `https://webhooks.yourdomain.com/sendgrid/events`  
   - If you use `WEBHOOK_SECRET`, append: `https://…/sendgrid/events?secret=YOUR_SECRET`  
   - Or leave URL plain and send header `X-Webhook-Secret: YOUR_SECRET` if your proxy adds it (SendGrid UI does not add custom headers by default — **query `?secret=` is the simplest**).
4. Select event types (Processed, Delivered, Open, Click, Bounce, etc.).
5. Save.

For local testing, expose with [ngrok](https://ngrok.com/) (or similar):

```bash
ngrok http 3001
```

Use the HTTPS URL SendGrid shows + `/sendgrid/events`.

### Signed webhook (SendGrid native)

SendGrid also supports **Signed Event Verification** (public key in dashboard). This repo uses a simple shared secret instead to avoid extra crypto dependencies. For enterprise-grade verification, follow [Twilio SendGrid Event Webhook security](https://docs.sendgrid.com/for-developers/tracking-events/getting-started-event-webhook-security-features).

## Example `curl` (local)

```bash
curl -s -X POST http://localhost:3001/sendgrid/events \
  -H "Content-Type: application/json" \
  -d '[
    {
      "email": "user@example.com",
      "timestamp": 1513299569,
      "event": "delivered",
      "sg_message_id": "sg-msg-id-001",
      "smtp-id": "<unique-smtp-id>"
    },
    {
      "email": "user@example.com",
      "timestamp": 1513299570,
      "event": "open",
      "sg_message_id": "sg-msg-id-001",
      "useragent": "Mozilla/5.0"
    }
  ]'
```

Duplicate `(sg_message_id, event, timestamp)` rows are ignored on repeat delivery (upsert with `$setOnInsert`).

## Production notes

- Do **not** commit `.env`.
- Put this service behind HTTPS (reverse proxy or PaaS).
- Restrict **GET `/events`** (IP allowlist, internal network, or add your own auth).
- MongoDB user should use least-privilege credentials scoped to this database.
