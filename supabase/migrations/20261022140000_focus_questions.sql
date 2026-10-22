-- v0.5 focus people + quick questions.
-- Idempotent: safe to re-run. Does not drop existing rows.

do $$ begin
  create type question_answer_type as enum ('text', 'choice');
exception when duplicate_object then null;
end $$;

-- Person must belong to family: composite unique so FKs can check both columns.
create unique index if not exists people_id_family_id_key on people (id, family_id);

create table if not exists focus_people (
  account_id uuid not null references accounts(id) on delete cascade,
  family_id uuid not null references families(id) on delete cascade,
  person_id uuid not null references people(id) on delete cascade,
  position int not null,
  created_at timestamptz not null default now(),
  primary key (account_id, family_id, person_id),
  foreign key (person_id, family_id) references people(id, family_id) on delete cascade
);

alter table focus_people enable row level security;

create index if not exists idx_focus_people_account_family
  on focus_people (account_id, family_id, position);

create table if not exists question_bank (
  id uuid primary key default uuid_generate_v4(),
  key text not null unique,
  text_th text not null,
  category text not null,
  answer_type question_answer_type not null default 'text',
  choices jsonb,
  active boolean not null default true,
  sort int not null
);

alter table question_bank enable row level security;

create index if not exists idx_question_bank_active_sort
  on question_bank (active, sort);

create table if not exists person_facts (
  id uuid primary key default uuid_generate_v4(),
  family_id uuid not null references families(id) on delete cascade,
  person_id uuid not null references people(id) on delete cascade,
  question_id uuid not null references question_bank(id),
  author_account_id uuid not null references accounts(id) on delete cascade,
  answer_text text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  foreign key (person_id, family_id) references people(id, family_id) on delete cascade
);

alter table person_facts enable row level security;

create unique index if not exists uq_person_facts_live
  on person_facts (person_id, question_id, author_account_id)
  where deleted_at is null;

create index if not exists idx_person_facts_person
  on person_facts (person_id)
  where deleted_at is null;

create table if not exists question_skips (
  account_id uuid not null references accounts(id) on delete cascade,
  person_id uuid not null references people(id) on delete cascade,
  question_id uuid not null references question_bank(id),
  skipped_at timestamptz not null default now(),
  primary key (account_id, person_id, question_id)
);

alter table question_skips enable row level security;

create index if not exists idx_question_skips_lookup
  on question_skips (account_id, person_id, skipped_at);

comment on table focus_people is 'Per-account home focus people; max 10 per account per family';
comment on column focus_people.position is 'Display order from PUT person_ids (0-based)';
comment on table question_bank is 'Quick-question templates; text_th uses {name}';
comment on table person_facts is 'Answers to quick questions; unique live row per author/person/question';
comment on table question_skips is 'Skipped questions are not re-offered for 30 days';

-- Seed from quick-questions-v0.1 (Eddy). Stable ids from keys q01–q20.
insert into question_bank (id, key, text_th, category, answer_type, choices, active, sort)
values
  ('00000000-0000-4000-a000-000000000001', 'q01', $q$อาหารโปรดของ{name}คืออะไร$q$, 'favorites', 'text', null, true, 1),
  ('00000000-0000-4000-a000-000000000002', 'q02', $q$ขนมหรือของหวานที่{name}ชอบ$q$, 'favorites', 'text', null, true, 2),
  ('00000000-0000-4000-a000-000000000003', 'q03', $q$เพลงที่{name}ชอบฟัง หรือชอบร้อง$q$, 'favorites', 'text', null, true, 3),
  ('00000000-0000-4000-a000-000000000004', 'q04', $q$สีที่{name}ชอบใส่บ่อยๆ$q$, 'favorites', 'text', null, true, 4),
  ('00000000-0000-4000-a000-000000000005', 'q05', $q$ดอกไม้หรือต้นไม้ที่{name}ชอบ$q$, 'favorites', 'text', null, true, 5),
  ('00000000-0000-4000-a000-000000000006', 'q06', $q$คำพูดติดปากของ{name}$q$, 'habits', 'text', null, true, 6),
  ('00000000-0000-4000-a000-000000000007', 'q07', $q${name}มักทำอะไรตอนเช้า$q$, 'habits', 'text', null, true, 7),
  ('00000000-0000-4000-a000-000000000008', 'q08', $q$งานอดิเรกของ{name}$q$, 'habits', 'text', null, true, 8),
  ('00000000-0000-4000-a000-000000000009', 'q09', $q$เวลามีความสุข {name}มักทำอะไร$q$, 'habits', 'text', null, true, 9),
  ('00000000-0000-4000-a000-000000000010', 'q10', $q$เมนูที่{name}ทำอร่อยที่สุด$q$, 'skills', 'text', null, true, 10),
  ('00000000-0000-4000-a000-000000000011', 'q11', $q$สิ่งที่{name}เก่งจนใครๆ ก็ชม$q$, 'skills', 'text', null, true, 11),
  ('00000000-0000-4000-a000-000000000012', 'q12', $q$สิ่งที่{name}เคยสอนคุณ$q$, 'skills', 'text', null, true, 12),
  ('00000000-0000-4000-a000-000000000013', 'q13', $q$บ้านเกิดของ{name}อยู่ที่ไหน$q$, 'places', 'text', null, true, 13),
  ('00000000-0000-4000-a000-000000000014', 'q14', $q$ที่ที่{name}ชอบไปมากที่สุด$q$, 'places', 'text', null, true, 14),
  ('00000000-0000-4000-a000-000000000015', 'q15', $q$มุมโปรดในบ้านของ{name}$q$, 'places', 'text', null, true, 15),
  ('00000000-0000-4000-a000-000000000016', 'q16', $q$งานแรกของ{name}คืออะไร$q$, 'life', 'text', null, true, 16),
  ('00000000-0000-4000-a000-000000000017', 'q17', $q$ความฝันตอนเด็กของ{name}$q$, 'life', 'text', null, true, 17),
  ('00000000-0000-4000-a000-000000000018', 'q18', $q$เพื่อนสนิทของ{name}ชื่ออะไร$q$, 'life', 'text', null, true, 18),
  ('00000000-0000-4000-a000-000000000019', 'q19', $q$สิ่งที่ทำให้{name}หัวเราะได้เสมอ$q$, 'feelings', 'text', null, true, 19),
  ('00000000-0000-4000-a000-000000000020', 'q20', $q$คำสอนของ{name}ที่คุณยังจำได้$q$, 'feelings', 'text', null, true, 20)
on conflict (key) do update
set
  text_th = excluded.text_th,
  category = excluded.category,
  answer_type = excluded.answer_type,
  choices = excluded.choices,
  active = excluded.active,
  sort = excluded.sort;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon')
     and exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on table focus_people from anon, authenticated;
    revoke all on table question_bank from anon, authenticated;
    revoke all on table person_facts from anon, authenticated;
    revoke all on table question_skips from anon, authenticated;
  end if;
end
$$;
