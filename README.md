# LendLoop

Borrow what you need. Lend what you don't. A neighborhood tool-lending board built with
Next.js (App Router), Clerk, Convex and n8n.

> Work in progress. Full setup, architecture and security notes come at the end of the build.

## Local setup (so far)

1. `npm install`
2. `npx convex dev` — sign in to Convex and create a dev deployment. It writes `CONVEX_DEPLOYMENT`
   and `NEXT_PUBLIC_CONVEX_URL` to `.env.local` and keeps running (leave it open).
3. In the Clerk dashboard: create an application, then turn on the **Convex integration**
   (Integrations → Convex). Copy the **Frontend API URL** it shows.
   Then **Configure → Sessions → Customize session token** and add the claims Convex reads for
   names and emails:
   ```json
   { "email": "{{user.primary_email_address}}", "name": "{{user.full_name}}" }
   ```
4. `npx convex env set CLERK_JWT_ISSUER_DOMAIN <Frontend API URL>`
5. Add the Clerk keys to `.env.local` (see `.env.example`).
6. `npm run dev` → http://localhost:3000 → sign in → the page shows your Clerk user ID as read by Convex.
7. Make yourself admin (roles can't be changed from the browser):
   `npx convex run users:setRole '{"email":"you@example.com","role":"admin"}'`
8. `npm test` runs the Convex authorization tests.

## n8n (automations)

n8n runs locally in Docker (`n8nio/n8n:2.45.7`, pinned). Its data (credentials, executions) lives in the `n8n_data` Docker volume.

```bash
./scripts/n8n-init.sh        # once: creates n8n/.env with random secrets, copies the shared ones into Convex env
docker compose up -d         # n8n at http://localhost:5678 (bound to 127.0.0.1 only)
docker compose exec -T n8n n8n import:workflow --separate --input=/workflows
```

Then open http://localhost:5678, create the owner account, and **Publish** each LendLoop workflow. n8n doesn't activate any workflow until an owner exists.

### Networking: why there is a tunnel

Convex runs in the cloud and n8n runs on a laptop.

| Direction | How | Problem |
|---|---|---|
| n8n → Convex | Outbound HTTPS to `https://<deployment>.convex.site` | None |
| Convex → n8n | Convex calls an n8n webhook | A cloud function can't reach `localhost:5678` |

**Choice for development:** a Cloudflare quick tunnel. `./scripts/n8n-tunnel.sh` does four things:
1. Opens the tunnel and gets a public `https://…trycloudflare.com` URL.
2. Writes that URL to `N8N_WEBHOOK_URL` in `n8n/.env`.
3. Sets the same URL as the Convex env var `N8N_WEBHOOK_URL`.
4. Restarts n8n so it uses the URL.

It needs `cloudflared` (no account required):

```bash
mkdir -p ~/.local/bin && curl -fsSL -o ~/.local/bin/cloudflared https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 && chmod +x ~/.local/bin/cloudflared
```

**Trade-offs:**
- Quick-tunnel URLs change on every run. That's why the script exists.
- The tunnel only works while the laptop is on.
- Anyone who learns the URL can call the webhooks. That's acceptable only because every LendLoop webhook verifies an HMAC signature (see below).
- For production, run n8n on a server with a stable HTTPS domain (n8n Cloud, or EC2 behind Caddy), or a named Cloudflare tunnel.

`curl <tunnel-url>/webhook/lendloop-ping` is the reachability check. It proves the internet can reach n8n and n8n can reach Convex (`GET /health` on Convex), returning `{"n8n":"ok","convex":"ok"}`.

### Secrets

| Secret | Lives in | Purpose |
|---|---|---|
| `N8N_ENCRYPTION_KEY` | `n8n/.env` | Encrypts credentials stored in n8n |
| `N8N_WEBHOOK_SECRET` | `n8n/.env` + Convex env | Convex signs webhook calls to n8n; n8n verifies |
| `CONVEX_CALLBACK_SECRET` | `n8n/.env` + Convex env | n8n signs calls to Convex; Convex verifies |

- **One secret per direction.** If one leaks, only that direction can be forged.
- **Secrets stay out of workflow JSON.** Workflows read them with `{{ $env.NAME }}` (`N8N_BLOCK_ENV_ACCESS_IN_NODE=false`), so exported workflow JSON never contains them. Email or SMTP passwords go in n8n credentials, which are encrypted.
- **Check before committing:** `grep -rF "$(grep ^N8N_WEBHOOK_SECRET= n8n/.env | cut -d= -f2)" n8n/workflows` must find nothing.
- `n8n/.env` is git-ignored and `chmod 600`. `n8n/.env.example` lists the names only.

### Workflow 1: loan notifications (Convex → n8n)

```
loan mutation ──(same transaction)──► automationEvents row (pending) + scheduler.runAfter(0)
                                          │
                       sendLoanEvent action ── signed POST ──► n8n /webhook/lendloop-loan-event
                                          │                      verify → route → compose → send → remember → 200
                     recordAttempt: sent | retry in 1/5/30 min | failed (admin page, Retry button)
```

| Event | Recipient |
|---|---|
| `requested`, `cancelled` | Tool owner |
| `approved`, `declined` (incl. auto-declined overlaps), `returned`, `tool_removed` | Borrower |

**Why a scheduled action.** Mutations can't make network calls, and the user's click shouldn't wait on n8n. The notification row is written in the same transaction as the loan change. If the change rolls back, there's no notification; if it commits, delivery is always attempted.

**Payload (data minimisation).** It contains only:
- the recipient's email and first name;
- the other person's first name;
- the tool name, dates and status;
- the borrower's message, on `requested` only.

It never includes the other party's email or the tool description.

**Signing.** `X-LendLoop-Signature: sha256=HMAC_SHA256(N8N_WEBHOOK_SECRET, "<unix seconds>.<raw body>")`, plus `X-LendLoop-Timestamp` and `X-LendLoop-Event-Id`. n8n checks it as follows:
- It recomputes the HMAC over the **raw** body, not re-serialised JSON, and compares with `timingSafeEqual`.
- It rejects timestamps more than 5 minutes off, which blocks replays.
- It requires the event-ID header to match the body.
- Every failure returns a generic `401 {"error":"unauthorized"}`, so the response doesn't say which check failed.

**Idempotency, both sides:**
- Convex: the event ID is `loan:<loanId>:<event>`, deterministic and unique per transition. Enqueueing the same event twice is a no-op.
- n8n: delivered IDs are kept for 7 days in workflow static data, and a repeat gets `200 {"status":"duplicate"}`. An ID is stored only after the send step succeeds. So when a send fails, Convex's retry gets through instead of being dropped as a duplicate.

**Reliability:**
- Convex retries non-2xx answers, network errors and 10 s timeouts after 1, 5 and 30 minutes. After 4 attempts the event is `failed` and shown to admins with the last error.
- Missing configuration also ends up as `failed`, not silently skipped.
- Inside n8n, the send step has Retry On Fail (3 tries).

**Email transport.** n8n's *Send Email* node with an SMTP credential named **SMTP account** (Retry On Fail: 3 tries, 2 s apart). For Gmail:
- Host `smtp.gmail.com`, port `587`.
- **SSL/TLS off.** The connection upgrades itself to encryption (STARTTLS).
- Client Host Name empty.
- Password: a Gmail **app password**, not your normal Gmail password.

The credential is encrypted inside n8n. The exported workflow only references it by name, so after importing, pick or create the credential on that node.

### Workflow 2: daily overdue reminders (n8n → Convex)

```
09:00 Asia/Manila ─► Sign request ─► GET /n8n/overdue-loans ─► one item per loan ─► Send reminder (email)
                                                                                         │ (failures continue)
                       Summarize ◄── POST /n8n/reminder-status (signed, idempotent) ◄── Sign write-back
                       └─ throws if any email or write-back failed → error workflow
```

| Endpoint | Does |
|---|---|
| `GET /n8n/overdue-loans` | Approved loans whose end date is before today (UTC, decided by the server) with no successful reminder today. Returns `{ date, loans: [{ loanId, borrower: { email, firstName }, tool: { name }, endDate, daysOverdue }] }` |
| `POST /n8n/reminder-status` | `{ loanId, date, status: "sent" \| "failed", idempotencyKey, error? }`. Records the result once |

**Auth: signed requests, not a bearer token.** n8n signs every call with `sha256=HMAC(CONVEX_CALLBACK_SECRET, "<ts>.<METHOD> <path>.<body>")`. Convex recomputes it and compares in constant time, and it rejects timestamps more than 5 minutes off. Compared with a static bearer token:
- The secret never travels over the wire, so a logged or intercepted request can't be reused to call Convex later.
- The body is covered, so a write-back can't be altered in transit.
- Method and path are covered, so a captured signature can't be replayed against a different endpoint (a GET has no body to bind to).

A missing secret answers `503`, never "allow".

**Idempotency.** The key is `reminder:{loanId}:{YYYY-MM-DD}`, using the date Convex returned. The write-back looks it up through the `by_idempotencyKey` index and inserts only if it's absent. Convex mutations are serializable transactions, so concurrent retries can't both insert:
- The same key again returns `outcome: "duplicate"`.
- A `failed` row can be upgraded to `sent` by a later run.
- A sent loan drops out of the overdue list for the rest of that day.

So running the workflow 3 times on the same day sends one reminder per loan.

**Partial failure.**
- The email step has Retry On Fail, then *continues* on error. A failed email is written back as `failed`, so it shows on the admin page and stays on the overdue list for the next run.
- Both HTTP steps have Retry On Fail (3 tries, 5 s apart).
- The final *Summarize* step fails the run if any loan had a problem, so the error workflow alerts. The other loans were still processed.

**Known limit.** Two runs started at the same moment could both fetch the list before either writes back, and send two emails. The schedule runs once a day, so this only matters when triggering by hand mid-run. The fix would be a "claim" call before sending.

**Try it locally:**
```bash
npx convex run demo:makeOverdue '{"loanId":"<an approved loan id>","daysOverdue":2}'
```
Then click **Execute workflow** on *LendLoop 02*. `demo:makeOverdue` is an internal function, so it can only be run with deployment access, never from the browser.
