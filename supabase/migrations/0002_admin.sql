-- เปิดให้แอดมินแก้ข้อมูลผ่านหน้าเว็บได้
--
-- หน้า Admin เขียนข้อมูลจากเบราว์เซอร์ตรงเข้า Supabase โดยไม่ผ่านเซิร์ฟเวอร์ของเรา
-- ความปลอดภัยจึงอยู่ที่กฎในไฟล์นี้ล้วนๆ ไม่ใช่ที่หน้าเว็บ
-- (ซ่อนปุ่มในหน้าเว็บไม่ได้กันอะไรเลย ใครก็ยิงเข้าฐานข้อมูลตรงๆ ได้)

-- ── ใครคือแอดมิน ──────────────────────────────────────────
--
-- ไม่ให้สิทธิ์กับ "คนที่ล็อกอินแล้ว" ทั้งหมด เพราะถ้าเปิดให้สมัครเองได้
-- ใครสมัครก็จะกลายเป็นแอดมินทันที ต้องระบุตัวเป็นรายคนเท่านั้น

create table admins (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  note       text,
  created_at timestamptz not null default now()
);

alter table admins enable row level security;

create policy "แอดมินดูรายชื่อแอดมินได้"
  on admins for select to authenticated
  using (user_id = auth.uid());

-- security definer เพื่อให้ฟังก์ชันอ่านตาราง admins ได้โดยไม่ติด RLS ของตัวเอง
-- (ไม่งั้นจะวนกันเอง) และ search_path ล็อกไว้กันการสลับ schema
create function is_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (select 1 from admins where user_id = auth.uid());
$$;

-- ── สิทธิ์ของแอดมิน ────────────────────────────────────────

-- อ่านได้ทุกแถวรวมถึงที่ยังไม่เผยแพร่ (นโยบาย select ที่มีหลายอันจะถูกนำมา OR กัน
-- ของเดิมที่ให้คนทั่วไปอ่านเฉพาะ is_published จึงยังทำงานเหมือนเดิม)
create policy "แอดมินอ่านเกมได้ทุกแถว"
  on games for select to authenticated using (is_admin());

create policy "แอดมินเพิ่มเกมได้"
  on games for insert to authenticated with check (is_admin());

create policy "แอดมินแก้เกมได้"
  on games for update to authenticated using (is_admin()) with check (is_admin());

create policy "แอดมินลบเกมได้"
  on games for delete to authenticated using (is_admin());

create policy "แอดมินจัดการประกาศได้"
  on announcements for all to authenticated using (is_admin()) with check (is_admin());

create policy "แอดมินจัดการ changelog ได้"
  on changelogs for all to authenticated using (is_admin()) with check (is_admin());

-- รายงานบั๊ก: คนทั่วไปส่งได้อย่างเดียว (นโยบายเดิม) แอดมินอ่านและปิดงานได้
create policy "แอดมินอ่านรายงานบั๊กได้"
  on bug_reports for select to authenticated using (is_admin());

create policy "แอดมินอัปเดตสถานะบั๊กได้"
  on bug_reports for update to authenticated using (is_admin()) with check (is_admin());

-- ── อัปเดตเวลาแก้ไขล่าสุดให้เอง ────────────────────────────
--
-- ถ้าปล่อยให้หน้าเว็บส่ง updated_at มาเอง วันหนึ่งจะมีที่ที่ลืมส่งแล้วค่าค้างเก่า

create function touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger games_touch_updated_at
  before update on games
  for each row execute function touch_updated_at();
