-- ============================================================================
-- D.prince Learning Portal  -  database tables (Supabase / PostgreSQL)
--
-- EASIEST: you do not need to run this yourself. In the portal, sign in as Super
-- Admin -> Database / Supabase -> paste your Session pooler connection string ->
-- "Test and connect". The portal creates these tables for you.
--
-- OR BY HAND: Supabase Dashboard -> SQL Editor -> New query -> paste this file ->
-- Run. The result should end with one row saying:  portal tables ready
--
-- SAFE TO RUN
--   * Everything is created inside a separate schema called  dprince_portal.
--     Nothing in "public" (your existing users, courses, results, sessions ...)
--     is read, changed, moved or deleted.
--   * Running it again changes nothing.
--   * It contains no accounts and no passwords. When the portal first opens on
--     this database it asks you to create the Super Admin with your own email.
-- ============================================================================

begin;

-- All portal tables live in their own schema, so they can never collide with
-- tables your project already has in "public" (for example users, courses).
-- (checked first: creating a schema needs a right the portal's own login does not have)
do $$
begin
  if not exists (select 1 from pg_namespace where nspname = 'dprince_portal') then
    create schema dprince_portal;
  end if;
end $$;

-- ---------- 1. Users: super_admin | staff | student ----------
create table if not exists dprince_portal.users (
  id            serial primary key,
  name          varchar(150) not null,
  email         varchar(200) not null,
  username      varchar(100) not null,
  password_hash text not null,
  role          varchar(20) not null default 'student',
  is_active     boolean not null default true,
  created_by    integer,
  created_at    timestamptz not null default now()
);
create unique index if not exists users_email_idx on dprince_portal.users (email);
create unique index if not exists users_username_idx on dprince_portal.users (username);

-- ---------- 2. Login sessions (only a hash of each session token is stored) ----------
create table if not exists dprince_portal.auth_sessions (
  id         varchar(64) primary key,
  user_id    integer not null references dprince_portal.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create index if not exists auth_sessions_user_idx on dprince_portal.auth_sessions (user_id);

-- ---------- 3. Student profiles (school, class, department, semester ...) ----------
create table if not exists dprince_portal.student_profiles (
  id             serial primary key,
  user_id        integer not null references dprince_portal.users(id) on delete cascade,
  admission_no   varchar(50),
  school_name    varchar(200),
  class_level    varchar(100),
  department     varchar(100),
  semester       varchar(100),
  session        varchar(50),
  phone          varchar(50),
  gender         varchar(20),
  date_of_birth  date,
  address        text,
  guardian_name  varchar(150),
  guardian_phone varchar(50),
  updated_at     timestamptz not null default now()
);
create unique index if not exists student_profiles_user_idx on dprince_portal.student_profiles (user_id);

-- ---------- 4. Courses / subjects ----------
create table if not exists dprince_portal.courses (
  id          serial primary key,
  title       varchar(200) not null,
  code        varchar(50) not null,
  class_level varchar(100),
  department  varchar(100),
  semester    varchar(100),
  description text,
  created_by  integer references dprince_portal.users(id) on delete set null,
  created_at  timestamptz not null default now()
);

-- ---------- 5. Course registrations (staff/admin must approve) ----------
create table if not exists dprince_portal.course_registrations (
  id          serial primary key,
  student_id  integer not null references dprince_portal.users(id) on delete cascade,
  course_id   integer not null references dprince_portal.courses(id) on delete cascade,
  status      varchar(20) not null default 'pending',   -- pending | approved | rejected
  reviewed_by integer,
  reviewed_at timestamptz,
  created_at  timestamptz not null default now()
);
create unique index if not exists course_reg_unique_idx on dprince_portal.course_registrations (student_id, course_id);

-- ---------- 6. CBT tests ----------
create table if not exists dprince_portal.tests (
  id                serial primary key,
  course_id         integer not null references dprince_portal.courses(id) on delete cascade,
  title             varchar(200) not null,
  instructions      text,
  duration_minutes  integer not null default 30,
  start_at          timestamptz not null,
  end_at            timestamptz not null,
  is_published      boolean not null default false,
  shuffle_questions boolean not null default true,
  created_by        integer references dprince_portal.users(id) on delete set null,
  created_at        timestamptz not null default now()
);

-- ---------- 7. CBT questions ----------
create table if not exists dprince_portal.questions (
  id             serial primary key,
  test_id        integer not null references dprince_portal.tests(id) on delete cascade,
  question_text  text not null,
  option_a       text not null,
  option_b       text not null,
  option_c       text not null,
  option_d       text not null,
  correct_option varchar(1) not null,                    -- A | B | C | D
  marks          integer not null default 1,
  sort_order     integer not null default 0
);
create index if not exists questions_test_idx on dprince_portal.questions (test_id);

-- ---------- 8. CBT attempts and results ----------
create table if not exists dprince_portal.test_attempts (
  id           serial primary key,
  test_id      integer not null references dprince_portal.tests(id) on delete cascade,
  student_id   integer not null references dprince_portal.users(id) on delete cascade,
  started_at   timestamptz not null default now(),
  submitted_at timestamptz,
  status       varchar(20) not null default 'in_progress',  -- in_progress | submitted
  score        integer not null default 0,
  total_marks  integer not null default 0,
  answers      jsonb not null default '{}'::jsonb
);
create unique index if not exists attempt_unique_idx on dprince_portal.test_attempts (test_id, student_id);

-- ---------- 9. Notice board ----------
create table if not exists dprince_portal.notices (
  id         serial primary key,
  title      varchar(200) not null,
  body       text not null,
  audience   varchar(20) not null default 'all',         -- all | students | staff
  created_by integer references dprince_portal.users(id) on delete set null,
  created_at timestamptz not null default now()
);

-- ---------- 10. Messages (student <-> staff / super admin) ----------
create table if not exists dprince_portal.messages (
  id           serial primary key,
  sender_id    integer not null references dprince_portal.users(id) on delete cascade,
  recipient_id integer references dprince_portal.users(id) on delete cascade,   -- null = all staff/admin
  subject      varchar(200) not null,
  body         text not null,
  is_read      boolean not null default false,
  parent_id    integer,
  created_at   timestamptz not null default now()
);
create index if not exists messages_recipient_idx on dprince_portal.messages (recipient_id);

-- ---------- 11. Attendance ----------
create table if not exists dprince_portal.attendance (
  id         serial primary key,
  student_id integer not null references dprince_portal.users(id) on delete cascade,
  date       date not null,
  status     varchar(20) not null default 'present',     -- present | absent | late | excused
  note       text,
  marked_by  integer references dprince_portal.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create unique index if not exists attendance_unique_idx on dprince_portal.attendance (student_id, date);

-- ---------- 12. Promotion history ----------
create table if not exists dprince_portal.promotion_logs (
  id          serial primary key,
  student_id  integer not null references dprince_portal.users(id) on delete cascade,
  from_level  varchar(100),
  to_level    varchar(100) not null,
  promoted_by integer references dprince_portal.users(id) on delete set null,
  created_at  timestamptz not null default now()
);

-- ---------- 13. Academic sessions (added by the Super Admin) ----------
create table if not exists dprince_portal.academic_sessions (
  id         serial primary key,
  name       varchar(20) not null unique,                 -- e.g. 2025/2026
  is_current boolean not null default false,
  created_by integer references dprince_portal.users(id) on delete set null,
  created_at timestamptz not null default now()
);

-- ---------- 14. Assignments uploaded by students (PDF / DOCX) ----------
create table if not exists dprince_portal.assignments (
  id          serial primary key,
  student_id  integer not null references dprince_portal.users(id) on delete cascade,
  course_id   integer references dprince_portal.courses(id) on delete set null,
  title       varchar(200) not null,
  note        text,
  session     varchar(20),
  file_name   varchar(255) not null,
  file_type   varchar(10) not null,                       -- pdf | docx
  file_size   integer not null,
  status      varchar(20) not null default 'submitted',   -- submitted | reviewed
  feedback    text,
  reviewed_by integer references dprince_portal.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at  timestamptz not null default now()
);
create index if not exists assignments_student_idx on dprince_portal.assignments (student_id);
create index if not exists assignments_course_idx on dprince_portal.assignments (course_id);

-- ---------- 15. Assignment file contents ----------
create table if not exists dprince_portal.assignment_files (
  assignment_id integer primary key references dprince_portal.assignments(id) on delete cascade,
  data          bytea not null
);

-- ---------- 16-17. Course materials (handouts) and their files ----------
create table if not exists dprince_portal.course_materials (
  id          serial primary key,
  course_id   integer references dprince_portal.courses(id) on delete set null,
  title       varchar(200) not null,
  description text,
  price_kobo  integer not null default 0,                -- 0 = free
  file_name   varchar(255) not null,
  file_type   varchar(10) not null,                      -- pdf | docx | pptx
  file_size   integer not null,
  is_published boolean not null default true,
  uploaded_by integer references dprince_portal.users(id) on delete set null,
  created_at  timestamptz not null default now()
);
create table if not exists dprince_portal.course_material_files (
  material_id integer primary key references dprince_portal.course_materials(id) on delete cascade,
  data        bytea not null
);

-- ---------- 18-19. Payments for materials (Paystack or bank transfer) and transfer proofs ----------
create table if not exists dprince_portal.material_payments (
  id                         serial primary key,
  material_id                integer not null references dprince_portal.course_materials(id) on delete cascade,
  student_id                 integer not null references dprince_portal.users(id) on delete cascade,
  method                     varchar(20) not null,        -- paystack | bank_transfer
  amount_kobo                integer not null,
  reference                  varchar(100) not null unique,
  status                     varchar(20) not null default 'pending',  -- pending | paid | failed | rejected
  paystack_access_code       varchar(100),
  paystack_authorization_url text,
  payer_name                 varchar(150),
  payer_bank                 varchar(100),
  transfer_date              date,
  payer_note                 text,
  proof_file_name            varchar(255),
  proof_type                 varchar(10),
  reviewed_by                integer references dprince_portal.users(id) on delete set null,
  reviewed_at                timestamptz,
  review_note                text,
  paid_at                    timestamptz,
  created_at                 timestamptz not null default now()
);
create index if not exists material_payments_student_idx on dprince_portal.material_payments (student_id);
create index if not exists material_payments_material_idx on dprince_portal.material_payments (material_id);
create unique index if not exists material_payments_one_paid_idx on dprince_portal.material_payments (material_id, student_id) where status = 'paid';
create table if not exists dprince_portal.payment_proofs (
  payment_id integer primary key references dprince_portal.material_payments(id) on delete cascade,
  data       bytea not null
);

-- ---------- 20. School settings (e.g. bank account for transfers) ----------
create table if not exists dprince_portal.school_settings (
  key        varchar(100) primary key,
  value      text not null,
  updated_at timestamptz not null default now()
);

-- ---------- Upgrades: columns added in later versions (safe to repeat) ----------
alter table dprince_portal.tests            add column if not exists max_leaves integer not null default 3;
alter table dprince_portal.test_attempts    add column if not exists leave_count integer not null default 0;
alter table dprince_portal.test_attempts    add column if not exists leave_log jsonb not null default '[]'::jsonb;
alter table dprince_portal.test_attempts    add column if not exists auto_submitted boolean not null default false;
alter table dprince_portal.assignments      add column if not exists score numeric(6,2);
alter table dprince_portal.assignments      add column if not exists max_score integer not null default 100;
alter table dprince_portal.course_materials add column if not exists kind varchar(20) not null default 'handout';
alter table dprince_portal.course_materials add column if not exists exam_session varchar(20);
alter table dprince_portal.course_materials add column if not exists exam_type varchar(60);

-- ---------- Security ----------
-- The portal reads and writes through its own server-side database connection.
-- This schema is not exposed through the Supabase API, the browser-facing roles get
-- no access to it, and Row Level Security with no policies is a second barrier.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on schema dprince_portal from anon;
    revoke all on all tables in schema dprince_portal from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on schema dprince_portal from authenticated;
    revoke all on all tables in schema dprince_portal from authenticated;
  end if;
end $$;

alter table dprince_portal.users                enable row level security;
alter table dprince_portal.auth_sessions        enable row level security;
alter table dprince_portal.student_profiles     enable row level security;
alter table dprince_portal.courses              enable row level security;
alter table dprince_portal.course_registrations enable row level security;
alter table dprince_portal.tests                enable row level security;
alter table dprince_portal.questions            enable row level security;
alter table dprince_portal.test_attempts        enable row level security;
alter table dprince_portal.notices              enable row level security;
alter table dprince_portal.messages             enable row level security;
alter table dprince_portal.attendance           enable row level security;
alter table dprince_portal.promotion_logs       enable row level security;
alter table dprince_portal.academic_sessions    enable row level security;
alter table dprince_portal.assignments          enable row level security;
alter table dprince_portal.assignment_files     enable row level security;
alter table dprince_portal.course_materials     enable row level security;
alter table dprince_portal.course_material_files enable row level security;
alter table dprince_portal.material_payments    enable row level security;
alter table dprince_portal.payment_proofs       enable row level security;
alter table dprince_portal.school_settings      enable row level security;

commit;

-- ---------- Result ----------
select
  case when count(*) = 20 then 'portal tables ready' else 'INCOMPLETE - some tables are missing' end as status,
  count(*) as portal_tables_found
from information_schema.tables
where table_schema = 'dprince_portal'
  and table_name in ('users', 'auth_sessions', 'student_profiles', 'courses', 'course_registrations', 'tests',
                     'questions', 'test_attempts', 'notices', 'messages', 'attendance', 'promotion_logs',
                     'academic_sessions', 'assignments', 'assignment_files', 'course_materials',
                     'course_material_files', 'material_payments', 'payment_proofs', 'school_settings');
