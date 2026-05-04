# Objective
Assess production-reachable security weaknesses across the Express AI proxy and the Expo/Supabase mobile app, prioritizing exploitable abuse, data exposure, and privilege-boundary failures.

# Relevant information
- Production surfaces are `artifacts/api-server`, `artifacts/mobile`, direct Supabase access from the mobile client, and `artifacts/mobile/server/serve.js`.
- `artifacts/mockup-sandbox` is dev-only and out of scope unless production reachability is proven.
- Supabase CRUD is client-direct and relies on RLS in `supabase_schema.sql`.
- Express exposes `/api/health` and `/api/ai/*`; current recon shows no API-side auth checks.
- AI routes proxy Gemini and accept large base64 and spreadsheet/image payloads.
- Mobile app persists business/customer data and Supabase sessions in AsyncStorage.

# Tasks

### T001: Validate API abuse and backend exposure
- **Blocked By**: []
- **Details**:
  - Inspect `artifacts/api-server/src/app.ts`, `artifacts/api-server/src/routes/ai.ts`, and related config.
  - Confirm whether public callers can trigger costly AI actions, whether cross-origin browser access is allowed, and whether size/rate/execution controls are sufficient.
  - Acceptance: Confirm or reject production-reachable auth, abuse, or DoS findings with concrete code evidence.

### T002: Validate client-side data protection and rendering sinks
- **Blocked By**: []
- **Details**:
  - Inspect `artifacts/mobile/services/storage.ts`, `services/supabase*.ts`, `services/pdf*.ts`, `app/lead/*`, and auth/session handling.
  - Confirm whether local persistence or HTML/PDF rendering creates a real production vulnerability versus an accepted client-side risk.
  - Acceptance: Confirm only materially exploitable findings; dismiss self-only or purely theoretical issues.

### T003: Correlate deterministic scan results and synthesize
- **Blocked By**: [T001, T002]
- **Details**:
  - Review SAST/HoundDog output alongside manual findings.
  - Update relevant existing vulnerabilities if any appear; create grouped new findings only for validated issues.
  - Acceptance: Findings are deduplicated, severity-calibrated, grouped, and ready to report.