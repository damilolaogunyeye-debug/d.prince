# Connecting D.prince Learning Portal to your Supabase database

Project: `ipykxionlzmkstyvqugm`. Status when this was written: **not connected yet**.
The portal's tables have not been created in the project; its existing tables
(`users`, `courses`, `results`, `sessions`) are unchanged.

## The one step only you can do

Supabase only allows a database connection with the **database password**. The
publishable and secret API keys cannot open one or create tables. So:

1. Sign in to the portal as Super Admin and open **Database / Supabase**.
2. In Supabase press **Connect** (top of the page) -> **Session pooler** -> copy
   the string. Replace `[YOUR-PASSWORD]`, brackets included, with your database
   password (forgotten? Project Settings -> Database -> Reset database password).
3. Paste it into the form, fill in your name, email and a password for your
   Super Admin account, and press **Test and connect**.

The portal then tests the connection, creates its 12 tables, switches over, and
creates your Super Admin account in Supabase in the same step (so nobody else can
claim it). You are signed in with your email. Mistakes (placeholder password,
wrong password, the Direct-connection string) are reported in plain language and
nothing is switched.

## What it does to your project

- All portal tables live in their own schema, `dprince_portal`. Nothing in
  `public` is read, changed, moved or deleted.
- The schema is not exposed through the Supabase API, browser roles get no access,
  and Row Level Security is on.
- Accounts and data in the local preview database are not copied; the portal
  starts empty in Supabase apart from your Super Admin account.
- The portal has its own accounts (salted scrypt password hashes in
  `dprince_portal.users`); it does not use Supabase's Authentication tab.

## Where the connection is kept

In the local preview database (table `portal_settings`), because this hosting
resets `.env` between sessions while the local database persists. It is restored
automatically whenever the server starts. Anyone with access to that local
database can read the connection string, which contains the password.
**Disconnect** on the same page removes it and switches back. Setting the
environment variable `SUPABASE_DB_URL` instead takes priority over the saved value.

## Doing it by hand

`supabase/schema.sql` (also at `/setup-sql`) creates the same tables if you prefer
the SQL Editor. Afterwards you still connect through the form above.

## Verified / not verified

Tested end to end in a real browser against a local PostgreSQL database set up like
your project, including a restart, disconnect and wrong-password handling. It has
not been run against your Supabase project, because that needs the database password.
