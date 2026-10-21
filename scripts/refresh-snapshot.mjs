/**
 * อัปเดตข้อมูลสำรอง src/lib/snapshot.json จาก Supabase ก่อน build ทุกครั้ง (npm "prebuild")
 *
 * snapshot.json คือข้อมูลที่เว็บใช้แทนตอน Supabase ล่ม (ดู useSnapshot ใน src/lib/games.js)
 * ถ้าไม่อัปเดต เกมที่เพิ่มทีหลังจะหายจากเว็บตอน Supabase ล่ม — สคริปต์นี้ดึงของล่าสุดมาเขียนทับ
 *
 * ต้องไม่ทำให้ build พังเด็ดขาด: ไม่มีค่าตั้ง Supabase (เช่นตั้งไว้แค่ช่อง runtime ของ Cloudflare)
 * หรือ Supabase ตอบ error (เช่นโควต้าเต็ม) ก็แค่บอกในล็อกแล้วใช้ไฟล์เดิมต่อ
 */
import { readFile, writeFile } from 'node:fs/promises';

const OUT = new URL('../src/lib/snapshot.json', import.meta.url);

const GAME_FIELDS = [
  'id', 'slug', 'title', 'subtitle', 'status', 'cover_url', 'description',
  'patch_version', 'patch_format', 'patch_url', 'patch_updated_at',
  'source_spec', 'source_sha1', 'progress_stage', 'progress_percent', 'download_count',
  'console:consoles(id,name,slug,sort_order)',
].join(',');

async function loadDotEnv() {
  // ตอนรันในเครื่องค่าอยู่ใน .env (Astro อ่านเอง แต่สคริปต์นี้รันก่อน Astro)
  try {
    const text = await readFile(new URL('../.env', import.meta.url), 'utf8');
    for (const line of text.split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
    }
  } catch {
    // ไม่มี .env ก็ไม่เป็นไร
  }
}

async function main() {
  await loadDotEnv();
  const url = process.env.PUBLIC_SUPABASE_URL;
  const key = process.env.PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    console.log('[snapshot] ไม่มีค่าตั้ง Supabase ตอน build — ใช้ snapshot.json เดิม');
    return;
  }

  const get = async (path) => {
    const response = await fetch(`${url}/rest/v1/${path}`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new Error(`${path.split('?')[0]} ตอบ ${response.status}`);
    return response.json();
  };

  const [games, consoles, announcements, shopeeLinks] = await Promise.all([
    get(`games?select=${GAME_FIELDS}&is_published=eq.true&order=patch_updated_at.desc.nullslast`),
    get('consoles?select=id,name,slug,sort_order&order=sort_order'),
    get('announcements?select=body&is_active=eq.true&order=created_at.desc&limit=1'),
    get('shopee_links?select=url&is_active=eq.true'),
  ]);

  // เว็บต้องมีเกมเสมอ ถ้าได้รายการว่างมาน่าจะผิดปกติ (เช่นสิทธิ์อ่านถูกปิด) อย่าเขียนทับของดี
  if (!Array.isArray(games) || games.length === 0) {
    throw new Error('ได้รายการเกมว่างเปล่า');
  }

  const ids = games.map((g) => g.id).join(',');
  const changelogs = await get(
    `changelogs?select=game_id,version,body,released_at&game_id=in.(${ids})&order=released_at.desc`
  );

  const snapshot = {
    taken_at: new Date().toISOString().slice(0, 10),
    games,
    consoles,
    announcement: announcements[0] ?? null,
    shopee_links: shopeeLinks,
    changelogs,
  };
  await writeFile(OUT, `${JSON.stringify(snapshot, null, 2)}\n`);
  console.log(`[snapshot] อัปเดตแล้ว — ${games.length} เกม`);
}

main().catch((error) => {
  console.warn(`[snapshot] อัปเดตไม่สำเร็จ (${error.message}) — ใช้ snapshot.json เดิม`);
});
