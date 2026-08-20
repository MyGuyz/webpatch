-- สคีมาเริ่มต้นของ webpatch
--
-- กฎการเข้าถึง (RLS) สรุปสั้นๆ:
--   คนทั่วไป  — อ่านได้เฉพาะแถวที่เผยแพร่แล้ว และส่งรายงานบั๊กได้อย่างเดียว
--   แอดมิน    — ทำได้ทุกอย่าง
--
-- กุญแจฝั่งหน้าเว็บเป็นของเปิดเผย ใครก็หยิบไปยิงได้
-- ความปลอดภัยจึงอยู่ที่กฎในไฟล์นี้ ไม่ใช่ที่หน้าเว็บ

create table consoles (
  id          bigint generated always as identity primary key,
  name        text not null,
  slug        text not null unique,
  sort_order  int  not null default 0
);

create table games (
  id                bigint generated always as identity primary key,
  console_id        bigint not null references consoles (id) on delete restrict,
  slug              text   not null unique,
  title             text   not null,
  subtitle          text,
  cover_url         text,
  description       text,

  -- 'ready' = พร้อมให้แปะ, 'beta' = ปล่อยแล้วแต่ยังตรวจไม่ทั่ว, 'wip' = ยังทำอยู่
  status            text   not null default 'wip'
                    check (status in ('ready', 'beta', 'wip')),

  patch_version     text,
  patch_url         text,
  patch_format      text check (patch_format in ('ips', 'bps', 'ppf')),
  patch_updated_at  date,

  source_spec       text,
  source_sha1       text check (source_sha1 ~ '^[0-9a-fA-F]{40}$'),

  progress_stage    int  not null default 1 check (progress_stage between 1 and 5),
  progress_percent  int  not null default 0 check (progress_percent between 0 and 100),

  is_published      boolean not null default false,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  -- เกมที่บอกว่าพร้อมให้แปะ ต้องมีไฟล์แพตช์และรูปแบบครบจริง
  -- ไม่งั้นผู้ใช้จะกดแล้วเจอหน้าเปล่า
  constraint ready_games_need_a_patch check (
    status = 'wip' or (patch_url is not null and patch_format is not null)
  )
);

create index games_published_idx on games (is_published, status);

create table changelogs (
  id           bigint generated always as identity primary key,
  game_id      bigint not null references games (id) on delete cascade,
  version      text   not null,
  body         text   not null,
  released_at  date   not null default current_date
);

create table announcements (
  id          bigint generated always as identity primary key,
  body        text    not null,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

create table bug_reports (
  id             bigint generated always as identity primary key,
  game_id        bigint references games (id) on delete set null,
  patch_version  text,
  where_in_game  text,
  emulator       text,
  wrong_text     text,
  description    text not null,
  contact        text,
  image_urls     text[] not null default '{}',
  status         text not null default 'new'
                 check (status in ('new', 'triaged', 'fixed', 'wontfix')),
  created_at     timestamptz not null default now()
);

-- ── สิทธิ์การเข้าถึง ────────────────────────────────────────

alter table consoles      enable row level security;
alter table games         enable row level security;
alter table changelogs    enable row level security;
alter table announcements enable row level security;
alter table bug_reports   enable row level security;

-- คนทั่วไปอ่านได้เฉพาะของที่เผยแพร่แล้ว
create policy "อ่านรายการเครื่องเล่นได้"
  on consoles for select to anon, authenticated using (true);

create policy "อ่านเฉพาะเกมที่เผยแพร่แล้ว"
  on games for select to anon, authenticated using (is_published);

create policy "อ่าน changelog ของเกมที่เผยแพร่แล้ว"
  on changelogs for select to anon, authenticated
  using (exists (select 1 from games g where g.id = game_id and g.is_published));

create policy "อ่านประกาศที่เปิดอยู่"
  on announcements for select to anon, authenticated using (is_active);

-- รายงานบั๊ก: ส่งได้อย่างเดียว อ่านของคนอื่นไม่ได้
create policy "ส่งรายงานบั๊กได้"
  on bug_reports for insert to anon, authenticated with check (true);

-- การแก้ไขทั้งหมดใช้ service key ฝั่งเซิร์ฟเวอร์ ซึ่งข้าม RLS อยู่แล้ว
-- จึงไม่ต้องมี policy สำหรับ insert/update/delete ของตารางอื่น

-- ── ข้อมูลตั้งต้น ──────────────────────────────────────────

insert into consoles (name, slug, sort_order) values
  ('Super Famicom',    'snes', 1),
  ('Game Boy Advance', 'gba',  2),
  ('Nintendo DS',      'nds',  3),
  ('PlayStation',      'ps1',  4),
  ('PSP',              'psp',  5);
