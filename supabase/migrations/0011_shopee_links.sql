-- ลิงก์สินค้า Shopee สำหรับปุ่ม "คลิก = สนับสนุน" ในป๊อปอัปสนับสนุน (โดเนท)
--
-- เก็บเป็นตารางแทนที่จะฝังลิงก์ไว้ในโค้ด เพื่อให้ผู้ดูแลเว็บเพิ่ม/ลบ/ปิดลิงก์เองได้
-- ผ่าน SQL editor ของ Supabase โดยไม่ต้องแก้โค้ดหรือ deploy ใหม่ทุกครั้ง
-- หน้าเว็บจะสุ่มเลือก 1 ลิงก์จากที่ is_active = true ทุกครั้งที่เปิดป๊อปอัป

create table shopee_links (
  id         bigint generated always as identity primary key,
  url        text    not null,
  label      text,
  is_active  boolean not null default true,
  created_at timestamptz not null default now()
);

alter table shopee_links enable row level security;

create policy "อ่านลิงก์ Shopee ที่เปิดอยู่ได้"
  on shopee_links for select to anon, authenticated using (is_active);

create policy "แอดมินจัดการลิงก์ Shopee ได้"
  on shopee_links for all to authenticated using (is_admin()) with check (is_admin());
