/**
 * ข้อมูลตัวอย่างสำหรับพัฒนา ใช้เมื่อยังไม่ได้ตั้งค่า Supabase
 *
 * พอตั้งค่า Supabase แล้ว ไฟล์นี้จะไม่ถูกใช้อีก (ดู src/lib/games.js)
 * ข้อมูลจริงทั้งหมดอยู่ในฐานข้อมูล ไม่ใช่ในโค้ด
 */

export const SEED_CONSOLES = [
  { id: 1, name: 'Super Famicom', slug: 'snes', sort_order: 1 },
  { id: 2, name: 'Game Boy Advance', slug: 'gba', sort_order: 2 },
  { id: 3, name: 'PlayStation', slug: 'ps1', sort_order: 3 },
];

export const SEED_GAMES = [
  {
    id: 1,
    slug: 'bahamut-lagoon',
    title: 'Bahamut Lagoon',
    subtitle: 'บาฮามุท ลากูน',
    console: SEED_CONSOLES[0],
    status: 'ready',
    cover_url: null,
    description:
      'เกมวางแผนการรบและเลี้ยงมังกรจาก Square ฉบับภาษาไทย เน้นเนื้อเรื่องและบทสนทนา',
    patch_version: 'TH Ver1.3',
    patch_format: 'ips',
    patch_url: null,
    patch_updated_at: '2026-08-11',
    source_spec: 'Bahamut Lagoon (Japan) .sfc',
    // ค่าสมมติสำหรับโหมดตัวอย่าง — เป็น SHA1 ของไฟล์ทดสอบใน e2e
    source_sha1: '494179714a6cd627239dfededf2de9ef994caf03',
    progress_stage: 5,
    progress_percent: 100,
    download_count: 128,
    is_published: true,
  },
  {
    id: 2,
    slug: 'golden-sun-lost-age',
    title: 'Golden Sun: The Lost Age',
    subtitle: 'ภาคต่อของ Golden Sun',
    console: SEED_CONSOLES[1],
    status: 'ready',
    cover_url: null,
    description: 'ภาคต่อของ Golden Sun ฉบับภาษาไทย เน้นเนื้อเรื่องและบทสนทนา',
    patch_version: 'V1.0',
    patch_format: 'bps',
    patch_url: null,
    patch_updated_at: '2026-08-15',
    source_spec: 'Golden Sun - The Lost Age (USA) .gba',
    source_sha1: null,
    progress_stage: 5,
    progress_percent: 100,
    download_count: 47,
    is_published: true,
  },
  {
    id: 3,
    slug: 'harvest-moon-btn',
    title: 'Harvest Moon: Back to Nature',
    subtitle: 'ต้นตำรับเกมฟาร์มบน PlayStation',
    console: SEED_CONSOLES[2],
    status: 'wip',
    cover_url: null,
    description: 'อยู่ระหว่างตรวจบทพูดยาวๆ ในเกมว่ามีตัวอักษรล้นกรอบข้อความหรือเปล่า',
    patch_version: null,
    patch_format: 'ppf',
    patch_url: null,
    patch_updated_at: null,
    source_spec: 'Harvest Moon - Back to Nature (USA) [SLUS-01115] .bin (MODE2/2352)',
    source_sha1: null,
    progress_stage: 4,
    progress_percent: 82,
    download_count: 0,
    is_published: true,
  },
];

export const SEED_ANNOUNCEMENT = {
  body: 'เว็บนี้เพิ่งเริ่มต้น กำลังทยอยเพิ่มเกมและอัปเดตใหม่ๆ เข้ามาเรื่อยๆ แวะมาดูอีกทีได้นะครับ',
};
