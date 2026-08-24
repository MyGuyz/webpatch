-- รองรับไฟล์แนบวิดีโอในรายงานบั๊ก ไม่ใช่แค่รูปเหมือนที่ออกแบบไว้ตอนแรก (ดู ADR-009)
--
-- คอลัมน์เดิมชื่อ image_urls แต่ตอนนี้เก็บได้ทั้งรูปและวิดีโอ เปลี่ยนชื่อให้ตรงความหมาย
-- และเก็บเป็น "path" ในที่เก็บไฟล์ ไม่ใช่ URL ตรงๆ เพราะบักเก็ตเป็นแบบส่วนตัว (อ่านได้เฉพาะแอดมิน)
-- ต้องขอ signed URL ตอนจะดูจริง

alter table bug_reports rename column image_urls to media_paths;

-- ── ที่เก็บไฟล์แนบ ────────────────────────────────────────
--
-- private (public = false) เพราะรายงานบั๊กเป็นข้อมูลส่วนตัว (ADR-008)
-- จำกัดขนาดและชนิดไฟล์ไว้ที่บักเก็ตเองด้วย เป็นด่านสำรองถ้าฝั่งเว็บตรวจพลาด

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'bug-reports',
  'bug-reports',
  false,
  31457280, -- 30MB ต่อไฟล์ (ดู ADR-009)
  array[
    'image/jpeg', 'image/png', 'image/webp', 'image/gif',
    'video/mp4', 'video/webm', 'video/quicktime'
  ]
);

-- ผู้เล่นแนบไฟล์ได้ (ส่งได้อย่างเดียว อ่านคืนไม่ได้ — เหมือน bug_reports เอง)
create policy "แนบไฟล์บั๊กได้"
  on storage.objects for insert to anon, authenticated
  with check (bucket_id = 'bug-reports');

-- แอดมินดูไฟล์แนบได้ (ต้องขอ signed URL เพราะบักเก็ตเป็นแบบส่วนตัว)
create policy "แอดมินดูไฟล์แนบบั๊กได้"
  on storage.objects for select to authenticated
  using (bucket_id = 'bug-reports' and public.is_admin());
