# D.prince Learning Portal

School Management System built with Next.js (App Router), Tailwind CSS and PostgreSQL (Drizzle ORM).
All data is stored in PostgreSQL; nothing is kept in the browser.

## Signing in

- **New / empty database:** the portal shows *First-time setup*. The account created there, with your own email, is the Super Admin.
- **This preview's local database** still has three demo accounts from earlier: `admin / admin123`, `staff / staff123`, `student / student123`. Sign in as admin and open **My Profile** to set your own email, username and password.

Sessions are stored in the database (`auth_sessions`), so sign-ins survive restarts and no secret key is needed. Where a browser refuses cookies (the portal shown inside another site's frame, Safari / iPhone, strict privacy settings) the sign-in page detects it and the session is sent as a request header for that tab instead.

## Features

**Student dashboard** – profile (school/institution, class/level, department, semester, session, personal info), course/subject registration (requires staff approval), CBT tests with countdown timer + auto-submit, results, attendance, notice board, messaging to staff/super admin.

**Staff dashboard** – admit students, bulk upload (CSV), edit student information, promote students, remove students, approve/reject course registrations, create CBT tests (timer, start & end date), add questions manually / import CSV-JSON / **AI question assistant**, publish tests, view results, mark attendance, publish notices, reply to messages.

**Super Admin dashboard** – everything staff can do **plus** add/remove/deactivate staff and super admins, reset passwords, delete any conversation, and view the Database / Supabase status page.

Rule enforced in code: a student can only start a CBT test when (1) the course registration is **approved**, (2) the test is **published**, and (3) the current time is between the test's **start** and **end** date.

## Assignments, sessions and promotion

- **Assignments** (`/dashboard/assignments`): students upload PDF or Word (.docx) files up to 8 MB, optionally for a course approved for them. A file must really be in that format; a renamed file or an old .doc is refused. Files are stored in the database (`assignment_files`), so they persist with the rest of the data. Staff and the Super Admin can view or download any upload, filter the list, and mark it reviewed with feedback the student sees. Students can withdraw an upload until it is reviewed; the Super Admin can delete any.
- **Academic sessions** (`/dashboard/sessions`, Super Admin only): add sessions such as 2025/2026 and choose the current one. New uploads are labelled with the current session; the student profile and promotion use this list.
- **Promotion** (`/dashboard/students/promotion`, staff and Super Admin): move selected students to their next class (SSS 3, ND 2, HND 2 and 600 Level are final classes and are skipped with an explanation), or to any chosen class including Graduated, optionally moving them to a new session. Every change is listed in the promotion history.

## Course materials and payments

- **Course Materials** (`/dashboard/materials`): staff and the Super Admin upload handouts (PDF, DOCX or PPTX, up to 8 MB) for one course or for all students, with a price in naira (0 = free, otherwise at least ₦100). They can hide a handout; one that has been paid for cannot be deleted, because that would erase payment records.
- **Students** see handouts for their approved courses and general ones. Free handouts download at once; paid ones unlock after payment:
  - **Paystack**: the server creates the transaction (amount from the database, never from the browser) and the page opens Paystack's checkout. A payment counts only after the server confirms it with Paystack and the amount and currency match exactly. If the checkout cannot open, "Open Paystack in a new tab" works too; Paystack returns to `/payments/paystack/callback`, which confirms without needing a sign-in. Unfinished payments are re-checked whenever the student opens the page.
  - **Bank transfer**: the student sees the school's account and the exact amount, reports the transfer (payer name, date, optional PDF/JPG/PNG receipt), and staff confirm or reject it (with a reason) on **Payments**.
- **Payments** (`/dashboard/payments`, staff and Super Admin): transfers waiting for confirmation, and every payment with filters and totals. The Super Admin also sets the school bank account and the Paystack keys here.
- **Paystack keys** are read from `PAYSTACK_SECRET_KEY` / `PAYSTACK_PUBLIC_KEY` if set, otherwise from the server-side settings the Super Admin saves (local database, never sent to the browser). They are currently **test** keys: no real money moves. Paystack webhooks are not used because the preview address changes every session.

## Deploying on Vercel

1. **Put the project on GitHub.** Easiest (works from a phone): Super Admin → Database / Supabase → *Publish on Vercel* → download the 4 files (`dprince-portal.bundle.json`, `unbundle.mjs`, `package.json`, `package-lock.json`) and upload them to the top level of the repository. The build runs `unbundle.mjs` first, which restores every folder (and removes stray files that were uploaded without folders, in Vercel's build copy only). Alternatively, on a computer, download the zip and upload the contents of its `dprinceportal` folder keeping the folders.
2. **Import the repository in Vercel** (framework: Next.js; no build settings to change).
3. **Environment variables** (Vercel → Project → Settings → Environment Variables):
   - `DATABASE_URL` — the Supabase **Session pooler** connection string the portal uses (the restricted `dprince_app` login: `postgresql://dprince_app.<project-ref>:<password>@aws-1-<region>.pooler.supabase.com:5432/postgres`).
   - `PAYSTACK_SECRET_KEY` and `PAYSTACK_PUBLIC_KEY`.
   - Optional: one of `GEMINI_API_KEY` / `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` for the AI question tools.
4. **Deploy.** The build needs no database; the portal connects at run time and shows a clear message on the sign-in page if `DATABASE_URL` is missing or wrong.

`package-lock.json` pins every package version, so Vercel installs exactly what was tested instead of whatever was published minutes earlier.

## Supabase

Connected (since 2026-11-11 08:08 UTC) to project ipykxionlzmkstyvqugm through the restricted login `dprince_app`, which can only use the `dprince_portal` schema. Missing tables are created automatically at server start.

## The preview strips request headers

The hosted preview removes non-standard request headers (observed in the logs: `Next-Action` and `Origin` never arrive). Next.js needs `Next-Action` for every form, so:

- sign-in, first-run setup and logout are plain JSON requests to `/api/auth/*`;
- every other request copies Next.js's headers into a `__dph` query parameter, which `src/proxy.ts` turns back into headers (`src/lib/header-tunnel.ts`). `Origin` is never tunnelled, so cross-site form protection is unchanged;
- if the server's reply to a form is also hidden, the page refreshes and says so instead of silently doing nothing;
- every sign-in page load records which headers survive (Super Admin -> Database / Supabase -> Diagnostics).

## When the server is not answering

If a page is on screen while the server behind it is restarting, asleep, or newer than the page, a request fails. Instead of Next.js's generic "This page couldn't load" screen the portal now:

- says the server is not answering, keeps checking, and reloads the page by itself when it is back;
- on the sign-in page shows this inline and keeps the form;
- during a CBT test keeps the student's answers on screen and retries the submission every few seconds until it is accepted;
- shows technical details only if the server is answering and a fresh reload did not help.

Links (as opposed to forms) are full page loads when the server is gone, so those still show the hosting proxy's own error page.

**Diagnostics:** server starts, server errors and browser-reported errors are appended to `.portal-logs/events.jsonl` and listed under Super Admin -> Database / Supabase -> Diagnostics. No passwords, cookies or form contents are recorded.

## AI question assistant and CBT tools

On every CBT test page (staff and Super Admin):
- **AI Question Assistant**: draft questions from a topic and lesson notes. With an AI key an AI writes them; without one the built-in offline generator builds them from the notes, and the page says which was used. If the AI fails, the error is shown and offline drafts are offered.
- **Paste typed questions**: turns questions typed from a past paper ("1. … A. … B. … Answer: C", a `*` on the right option, or an answer key at the end) into CBT questions; missing answers or options are flagged. No AI needed.
- **Check questions**: offline checks for duplicates, identical/empty options, giveaway answers and lopsided answer letters; with an AI key, an AI review of whether the marked answers are correct.
- **Import**: CSV or JSON.

The AI key is set by the Super Admin on **AI Assistant** (`/dashboard/ai-assistant`): Google Gemini, OpenAI or Anthropic. It is checked with the provider before saving (the model is chosen from those the key can use) and stored server-side. `OPENAI_API_KEY` / `GEMINI_API_KEY` / `ANTHROPIC_API_KEY` in the environment take priority.

## Exam focus (CBT)

A website cannot stop a student minimising the browser or switching tabs. Instead the test starts in full screen, and leaving it, hiding the page (minimising / switching tab) or the window losing focus is recorded on the server. Each test has a limit ("times a student may leave the exam screen", default 3; 0 = record only): past it, the test is submitted automatically with the answers given. Staff see the count and "auto-submitted" in Results. Where full screen is not allowed (e.g. inside some preview frames) leaving is still recorded.

## Past questions and assignment marks

- **Past Questions** (`/dashboard/past-questions`): staff and the Super Admin upload past exam papers (PDF/DOCX/PPTX) with exam session and type, usually free; students of the course download them. Same storage and payment options as Course Materials.
- **Assignment marks**: staff and the Super Admin give a score out of a maximum (default 100) with feedback; students see "15 / 20 (75%)" on My Assignments.

## Database upgrades

The portal applies `supabase/schema.sql` (repeatable; it only adds what is missing, including new columns) every time it starts, so new versions update the Supabase tables automatically.

## Question import format

CSV: `question,optionA,optionB,optionC,optionD,answer,marks` (answer = A/B/C/D) or a JSON array of `{question,a,b,c,d,answer,marks}`.
