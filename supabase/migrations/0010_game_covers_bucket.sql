-- ที่เก็บภาพปกเกม — ตอบคำถามว่า "ภาพปกควรเก็บไว้ตรงไหน"
--
-- ต่างจากบักเก็ต bug-reports (private) ตรงที่บักเก็ตนี้เป็น public เพราะภาพปก
-- ต้องโชว์บนหน้าเว็บให้ทุกคนเห็นได้เลยผ่าน URL ตรงๆ ไม่ต้องขอ signed URL

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'game-covers',
  'game-covers',
  true,
  5242880, -- 5MB ต่อไฟล์ (ภาพปกไม่จำเป็นต้องใหญ่)
  array['image/jpeg', 'image/png', 'image/webp']
);

-- ใครก็อ่าน/โหลดภาพได้ (บักเก็ตนี้เป็น public)
create policy "อ่านภาพปกเกมได้ทุกคน"
  on storage.objects for select to anon, authenticated
  using (bucket_id = 'game-covers');

-- อัปโหลด/แก้ไข/ลบได้เฉพาะแอดมิน กันคนนอกอัปโหลดไฟล์แปลกๆ เข้ามา
create policy "แอดมินอัปโหลดภาพปกเกมได้"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'game-covers' and public.is_admin());

create policy "แอดมินแก้ภาพปกเกมได้"
  on storage.objects for update to authenticated
  using (bucket_id = 'game-covers' and public.is_admin());

create policy "แอดมินลบภาพปกเกมได้"
  on storage.objects for delete to authenticated
  using (bucket_id = 'game-covers' and public.is_admin());
