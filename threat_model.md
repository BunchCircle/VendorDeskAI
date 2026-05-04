# Threat Model

## Project Overview

VendorDesk.ai is a pnpm monorepo with two production-facing surfaces: an Expo mobile/web client in `artifacts/mobile` and an Express API in `artifacts/api-server`. The mobile app authenticates users with Supabase email OTP, stores and syncs vendor/customer business records through Supabase, and calls backend AI endpoints for chat, transcription, and catalogue extraction. The Express server acts as a public API and Gemini proxy. The mockup sandbox is development-only and should be ignored unless production reachability is proven.

## Assets

- **User accounts and sessions** — Supabase-authenticated user identities and persisted client sessions. Compromise would let an attacker act as a vendor and access their business records.
- **Vendor and customer business data** — vendor profiles, product catalogues, leads, quotations, invoices, GST information, phone numbers, email addresses, and addresses stored in Supabase and cached on-device. Exposure would leak commercially sensitive and personal data.
- **AI provider credentials and quota** — the backend Gemini API key in `artifacts/api-server/src/routes/ai.ts`. Abuse would consume paid quota and make the AI features unavailable.
- **Generated documents and exports** — quotation and invoice HTML/PDF content generated from stored records. These documents may contain sensitive customer and tax data and are rendered in trusted app/browser contexts.

## Trust Boundaries

- **Mobile/web client to Supabase** — the client is untrusted and talks directly to Supabase with an anon key. Row-level security must enforce per-user isolation server-side.
- **Mobile/web client to Express API** — requests to `/api/ai/*` cross from an untrusted client into a backend that holds the Gemini API key and can trigger expensive processing.
- **Express API to Gemini** — the backend calls Google Gemini with a secret API key. Public access to this boundary can become cost-amplification or denial-of-service.
- **Local device storage to active session** — AsyncStorage persists user data and sessions on the device. Anything stored there should be treated as recoverable by a device-level attacker.
- **Public versus authenticated surfaces** — Supabase-backed CRUD is authenticated via Supabase session, while the Express API currently exposes public endpoints. This split must be explicit and intentional.
- **Production versus dev-only code** — `artifacts/mockup-sandbox`, local build scripts, and development helpers are out of scope unless they are shown to be reachable in production.

## Scan Anchors

- **Production entry points**
  - `artifacts/mobile/app/_layout.tsx`
  - `artifacts/mobile/services/supabase.ts`
  - `artifacts/mobile/services/supabaseData.ts`
  - `artifacts/mobile/services/ai.ts`
  - `artifacts/api-server/src/app.ts`
  - `artifacts/api-server/src/routes/ai.ts`
  - `artifacts/mobile/server/serve.js`
- **Highest-risk areas**
  - Public AI proxy routes and request sizing/CORS in `artifacts/api-server/src/app.ts` and `artifacts/api-server/src/routes/ai.ts`
  - Direct client data access and on-device persistence in `artifacts/mobile/services/supabase*.ts` and `artifacts/mobile/context/AppContext.tsx`
  - HTML/PDF generation and browser print flow in `artifacts/mobile/services/pdf.ts`, `artifacts/mobile/services/pdfActions.ts`, and `artifacts/mobile/app/lead/*`
- **Public surfaces**: `/api/health`, `/api/ai/*`, static mobile landing/build server routes.
- **Authenticated surfaces**: Supabase-backed vendor/profile/product/lead/quotation/invoice operations gated by Supabase auth + RLS.
- **Admin surfaces**: none identified.
- **Dev-only areas to usually ignore**: `artifacts/mockup-sandbox`, local scripts, build tooling, and migration helper code unless production reachability is demonstrated.

## Threat Categories

### Spoofing

The mobile app relies on Supabase email OTP and persisted sessions from `artifacts/mobile/services/supabase.ts`. All data operations that touch vendor records must remain scoped to `auth.uid()` on the Supabase side, because the client cannot be trusted to enforce identity. The Express API should not assume requests come from a legitimate app instance unless it validates user identity explicitly.

### Tampering

Client-provided records, generated quotation items, uploaded catalogue contents, and AI prompts are fully attacker-controlled. The system must validate and constrain these inputs before they affect persisted business data, rendered documents, or expensive backend processing. Any server-side processing triggered by client input must enforce size and abuse limits.

### Information Disclosure

Vendor profiles, lead contact details, GST numbers, invoices, and quotations are sensitive customer/business data. Supabase must continue enforcing per-user isolation with RLS, logs must not emit secrets or session material, and rendered documents must not allow untrusted content to execute in a privileged browser/app context.

### Denial of Service

The backend AI routes are cost-sensitive and computationally expensive because they proxy Gemini and parse large payloads such as base64 audio, spreadsheets, and images. Production must prevent anonymous or cross-origin abuse with authentication and/or effective rate limiting, plus request-size and execution controls that match expected usage.

### Elevation of Privilege

There is no separate admin plane, so the most important privilege boundary is one vendor versus another. Supabase CRUD paths must remain protected by row-level security, and any backend endpoint that can act on behalf of a user must bind actions to a validated identity rather than trusting client-supplied context.