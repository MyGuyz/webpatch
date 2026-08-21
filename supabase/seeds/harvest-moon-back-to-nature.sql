-- ใส่เกมแรกลงฐานข้อมูล — Harvest Moon: Back to Nature (PS1)
--
-- วิธีใช้: คัดลอกทั้งไฟล์ไปวางใน SQL Editor ของ Supabase แล้วกด Run
--
-- ก่อนรัน ให้แทนที่ค่า source_sha1 ด้วยค่าจริงของแผ่นเกมต้นฉบับ
-- หาค่าได้ที่หน้า /tools/sha1 บนเว็บ (ลากไฟล์ .bin ลงไปแล้วคัดลอกค่าที่ได้)
--
-- ถ้ายังไม่อยากตรวจรุ่น ให้เปลี่ยนบรรทัดนั้นเป็น null
-- แต่ผู้ใช้ที่เอาไฟล์ผิดรุ่นมาแปะจะได้ไฟล์เสียโดยไม่รู้ตัว

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
  -- ค้นหา id ของ PS1 เอง จะได้ไม่ต้องเดาว่าเป็นเลขอะไร
  (select id from consoles where slug = 'ps1'),
  'harvest-moon-back-to-nature',
  'Harvest Moon: Back to Nature',
  'ต้นตำรับเกมฟาร์มบน PlayStation',
  'ready',
  'ฉบับภาษาไทย เล่นได้ครบทั้งเกม',
  'V1.0',
  'ppf',
  'https://github.com/MyGuyz/webpatch/releases/download/harvest_moon_back_to_nature_V1.0/HMBN_Th.ppf',
  '2026-08-21',
  'Harvest Moon - Back to Nature (USA) [SLUS-01115] .bin (MODE2/2352)',

  'ใส่ค่า SHA1 ตรงนี้',   -- ◄── แก้บรรทัดนี้ก่อนรัน

  5,
  100,
  true
);
