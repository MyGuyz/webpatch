-- ใส่เกม Resident Evil 4 (USA) — PS2 ลงฐานข้อมูล
--
-- วิธีใช้: คัดลอกทั้งไฟล์ไปวางใน SQL Editor ของ Supabase แล้วกด Run
--
-- ยังไม่เคยมีเกม PS2 มาก่อน จึงต้องเพิ่มเครื่องเล่นใหม่ก่อน (ตาราง consoles ไม่มีหน้า
-- Admin ให้เพิ่มเอง ตั้งใจให้ทำผ่าน SQL Editor ตรงๆ เพราะแทบไม่ต้องเพิ่มบ่อย)
--
-- ตรวจไฟล์แพตช์นี้แล้ว: PPF3.0 · Blockcheck เปิดอยู่ (เช็ค MD5 ต้นทางในตัวเองด้วย) ·
-- ตัวแปะของเว็บรองรับไฟล์ขนาดนี้แล้ว (ดู ADR-016 — เดิมพังเพราะ ArrayBuffer เกิน ~2GB)
--
-- source_sha1 ด้านล่างคำนวณจากไฟล์ "Resident Evil 4 (USA).iso" ตรงๆ แล้ว
-- (ขนาด 4,435,836,928 ไบต์ ตรงกับที่ README ของแพตช์ระบุ, MD5 84330d2465d55ae391000a475ef4ac76
-- ตรงกับ README เป๊ะ — ยืนยันแล้วว่าเป็นไฟล์ถูกรุ่นก่อนคำนวณ SHA1)

insert into consoles (name, slug, sort_order) values
  ('PlayStation 2', 'ps2', 6)
on conflict (slug) do nothing;

insert into games (
  console_id,
  slug,
  title,
  subtitle,
  status,
  description,
  patch_version,
  patch_format,
  patch_url,
  patch_updated_at,
  source_spec,
  source_sha1,
  progress_stage,
  progress_percent,
  is_published
) values (
  (select id from consoles where slug = 'ps2'),
  'resident-evil-4',
  'Resident Evil 4',
  'เวอร์ชัน PS2 (USA)',
  'beta', -- ยังมีบางจุดเป็นอังกฤษอยู่ตามที่ระบุใน description — เปลี่ยนเป็น 'ready' ทีหลังได้ที่ /admin ถ้าคิดว่าเสร็จสมบูรณ์แล้ว
  'แปลบทสนทนาและเมนูหลักเป็นภาษาไทยแล้ว จุดที่ยังเป็นอังกฤษอยู่: ชื่อไอเทมบางส่วน, ' ||
  'หน้าจอ memory card, เมนูบางส่วน และตัวอักษร START/LOAD/OPTIONS หน้าไตเติล (เป็นรูปภาพ แปลไม่ได้ด้วยวิธีนี้) — ' ||
  'แนะนำตั้งค่า PCSX2: Graphics → Bilinear Filtering → "Bilinear (Forced excluding sprite)" จะได้ตัวหนังสือคมขึ้น',
  'V1.0',
  'ppf',
  'https://github.com/MyGuyz/webpatch/releases/download/resident_evil_4_V1.0/RE4_Thai.ppf',
  current_date,
  'Resident Evil 4 (USA) [PS2] .iso (4,435,836,928 ไบต์ · MD5 84330d2465d55ae391000a475ef4ac76)',
  '319feec780c4cc5a4174033951c0cc98b53db72a',
  5,
  100,
  true
);
