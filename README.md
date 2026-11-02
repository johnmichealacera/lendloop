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
4. `npx convex env set CLERK_JWT_ISSUER_DOMAIN <Frontend API URL>`
5. Add the Clerk keys to `.env.local` (see `.env.example`).
6. `npm run dev` → http://localhost:3000 → sign in → the page shows your Clerk user ID as read by Convex.
