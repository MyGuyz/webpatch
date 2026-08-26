-- คำขอ/โหวตเกมที่อยากให้แปลต่อไป (ดู ADR-012)
-- คนทั่วไปแนะนำเกมใหม่ได้ตรงๆ (เหมือนแจ้งบั๊ก) แต่การโหวตต้องผ่าน API route
-- เพื่อกันโหวตซ้ำด้วย hash ของ IP — ใช้ secret ชุดเดียวกับ ADR-010/011 ไม่ต้องตั้งเพิ่ม

create table game_requests (
  id          bigint generated always as identity primary key,
  title       text not null,
  note        text,
  status      text not null default 'open'
              check (status in ('open', 'planned', 'declined')),
  vote_count  int not null default 0,
  created_at  timestamptz not null default now()
);

alter table game_requests enable row level security;

create policy "อ่านคำขอเกมที่ไม่ถูกปฏิเสธ"
  on game_requests for select to anon, authenticated using (status <> 'declined');

create policy "แนะนำเกมได้"
  on game_requests for insert to anon, authenticated with check (true);

create policy "แอดมินจัดการคำขอเกมได้"
  on game_requests for update to authenticated using (is_admin()) with check (is_admin());

create policy "แอดมินลบคำขอเกมได้"
  on game_requests for delete to authenticated using (is_admin());

-- ตาราง log กันโหวตซ้ำ — เก็บแค่ hash ของ IP ไม่มี policy ให้ anon/authenticated เลย
-- เข้าถึงได้เฉพาะ service role จาก API route เท่านั้น (รูปแบบเดียวกับ game_download_log)
create table game_request_votes (
  ip_hash     text not null,
  request_id  bigint not null references game_requests (id) on delete cascade,
  primary key (ip_hash, request_id)
);

alter table game_request_votes enable row level security;

create function increment_game_request_vote(p_request_id bigint)
returns void
language sql
security definer
set search_path = public
as $$
  update game_requests set vote_count = vote_count + 1 where id = p_request_id;
$$;
