-- นับจำนวนครั้งที่มีคนโหลดไฟล์แพตช์ไปใช้ (ดู ADR-011)
-- กันนับซ้ำด้วยการจำกัด "1 คน 1 เกม 1 ครั้งต่อวัน" ผ่านตาราง log ที่เก็บแค่ hash ของ IP
-- (รูปแบบเดียวกับ bug_report_rate_limit — ดู 0004) ไม่มี policy ให้ anon/authenticated เลย
-- เข้าถึงได้เฉพาะ service role จาก API route ฝั่งเซิร์ฟเวอร์เท่านั้น

alter table games add column download_count int not null default 0;

create table game_download_log (
  ip_hash text not null,
  game_id bigint not null references games (id) on delete cascade,
  day date not null default current_date,
  primary key (ip_hash, game_id, day)
);

alter table game_download_log enable row level security;

-- บวกตัวนับแบบอะตอมมิก กันแข่งกันอ่าน-เขียนถ้ามีคนโหลดพร้อมกันพอดี
create function increment_game_download_count(p_game_id bigint)
returns void
language sql
security definer
set search_path = public
as $$
  update games set download_count = download_count + 1 where id = p_game_id;
$$;
