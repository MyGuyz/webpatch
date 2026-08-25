-- ตารางกันสแปมสำหรับฟอร์มแจ้งบั๊ก (ดู ADR-010)
-- เก็บแค่ hash ของ IP ไม่เก็บ IP จริง จึงย้อนกลับไปหา IP เดิมไม่ได้
-- ไม่มี policy ใดๆ ให้ anon/authenticated เลย เข้าถึงได้เฉพาะ service role
-- (ใช้จาก API route ฝั่งเซิร์ฟเวอร์เท่านั้น ไม่มีทางเรียกตรงจากเบราว์เซอร์)

create table bug_report_rate_limit (
  ip_hash text primary key,
  window_start timestamptz not null default now(),
  count int not null default 1
);

alter table bug_report_rate_limit enable row level security;
