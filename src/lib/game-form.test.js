import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { buildGamePayload, explainSaveError } from './game-form.js';

/** ฟอร์มที่กรอกครบถูกต้อง ใช้เป็นฐานแล้วแก้ทีละช่องในแต่ละเทส */
const valid = {
  console_id: '4',
  slug: 'harvest-moon-back-to-nature',
  title: 'Harvest Moon: Back to Nature',
  status: 'ready',
  patch_url:
    'https://github.com/MyGuyz/webpatch/releases/download/harvest_moon_back_to_nature_V1.0/HMBN_Th.ppf',
  patch_format: 'ppf',
  source_sha1: 'cb26381fa1336bdd15f07469e59f1143ccf37b03',
  progress_stage: '5',
  progress_percent: '100',
  is_published: true,
};

const build = (overrides = {}) => buildGamePayload({ ...valid, ...overrides });

describe('ฟอร์มเพิ่มเกม', () => {
  test('ฟอร์มที่กรอกครบผ่าน และแปลงชนิดข้อมูลให้ถูก', () => {
    const result = build();
    assert.equal(result.ok, true);
    assert.equal(result.payload.console_id, 4);
    assert.equal(result.payload.progress_stage, 5);
    assert.equal(result.payload.progress_percent, 100);
    assert.equal(result.payload.is_published, true);
  });

  test('ช่องที่เว้นว่างกลายเป็น null ไม่ใช่สตริงว่าง', () => {
    // สตริงว่างจะทำให้หน้าเว็บแสดงช่องเปล่าๆ แทนที่จะซ่อนไป
    const { payload } = build({ subtitle: '   ', cover_url: '', description: undefined });
    assert.equal(payload.subtitle, null);
    assert.equal(payload.cover_url, null);
    assert.equal(payload.description, null);
  });

  test('ตัดช่องว่างหัวท้ายออกจากค่าที่กรอก', () => {
    const { payload } = build({ title: '  Harvest Moon  ', slug: ' harvest-moon ' });
    assert.equal(payload.title, 'Harvest Moon');
    assert.equal(payload.slug, 'harvest-moon');
  });

  describe('ชื่อย่อ (slug)', () => {
    test('รับเฉพาะตัวพิมพ์เล็ก ตัวเลข และขีดกลาง', () => {
      for (const slug of ['Harvest-Moon', 'harvest moon', 'harvest_moon', 'harvest--moon', '-hm', 'hm-']) {
        assert.equal(build({ slug }).ok, false, `ควรปฏิเสธ: ${slug}`);
      }
    });

    test('รับรูปแบบที่ถูกต้อง', () => {
      for (const slug of ['hm', 'harvest-moon', 'ff7-remake', 'pokemon2']) {
        assert.equal(build({ slug }).ok, true, `ควรรับ: ${slug}`);
      }
    });

    test('บอกด้วยว่าต้องกรอกเมื่อเว้นว่าง', () => {
      assert.match(build({ slug: '' }).errors.slug, /ต้องใส่ชื่อย่อ/);
    });
  });

  describe('ลิงก์ไฟล์แพตช์', () => {
    test('ปฏิเสธลิงก์ที่ไม่ใช่ GitHub', () => {
      const result = build({ patch_url: 'https://evil.example.com/patch.ppf' });
      assert.equal(result.ok, false);
      assert.match(result.errors.patch_url, /GitHub/);
    });

    test('ปฏิเสธ http ที่ไม่เข้ารหัส', () => {
      assert.equal(build({ patch_url: 'http://github.com/x/y/z.ppf' }).ok, false);
    });
  });

  describe('รูปแบบแพตช์', () => {
    test('ปฏิเสธรูปแบบที่ตัวแปะยังไม่รองรับ', () => {
      const result = build({ patch_format: 'xdelta' });
      assert.equal(result.ok, false);
      assert.match(result.errors.patch_format, /ยังไม่รองรับ/);
    });

    test('รับตัวพิมพ์ใหญ่แล้วแปลงเป็นพิมพ์เล็กให้', () => {
      assert.equal(build({ patch_format: 'PPF' }).payload.patch_format, 'ppf');
    });
  });

  describe('เกมที่บอกว่าพร้อมให้แปะ', () => {
    test('ต้องมีลิงก์แพตช์', () => {
      const result = build({ patch_url: '' });
      assert.equal(result.ok, false);
      assert.match(result.errors.patch_url, /ต้องมีลิงก์/);
    });

    test('ต้องระบุรูปแบบแพตช์', () => {
      const result = build({ patch_format: '' });
      assert.equal(result.ok, false);
      assert.match(result.errors.patch_format, /ต้องระบุรูปแบบ/);
    });

    test('BETA ก็ต้องมีครบเหมือนกัน เพราะปล่อยให้เล่นแล้ว', () => {
      assert.equal(build({ status: 'beta', patch_url: '' }).ok, false);
    });

    test('แต่เกมที่ยังทำอยู่ไม่ต้องมี', () => {
      assert.equal(build({ status: 'wip', patch_url: '', patch_format: '' }).ok, true);
    });
  });

  describe('SHA1', () => {
    test('ปฏิเสธค่าที่ความยาวไม่ถึง 40', () => {
      assert.equal(build({ source_sha1: 'cb26381f' }).ok, false);
    });

    test('ปฏิเสธค่าที่มีตัวอักษรนอกเหนือ a-f 0-9', () => {
      assert.equal(build({ source_sha1: 'z'.repeat(40) }).ok, false);
    });

    test('รับตัวพิมพ์ใหญ่แล้วแปลงเป็นพิมพ์เล็ก', () => {
      const { payload } = build({ source_sha1: 'CB26381FA1336BDD15F07469E59F1143CCF37B03' });
      assert.equal(payload.source_sha1, 'cb26381fa1336bdd15f07469e59f1143ccf37b03');
    });

    test('เว้นว่างได้ = ไม่ตรวจรุ่น', () => {
      assert.equal(build({ source_sha1: '' }).payload.source_sha1, null);
    });
  });

  describe('ความคืบหน้า', () => {
    test('บีบค่าที่เกินช่วงให้อยู่ในกรอบ แทนที่จะปฏิเสธ', () => {
      assert.equal(build({ progress_stage: '9' }).payload.progress_stage, 5);
      assert.equal(build({ progress_stage: '0' }).payload.progress_stage, 1);
      assert.equal(build({ progress_percent: '250' }).payload.progress_percent, 100);
      assert.equal(build({ progress_percent: '-5' }).payload.progress_percent, 0);
    });

    test('ค่าที่ไม่ใช่ตัวเลขใช้ค่าเริ่มต้น', () => {
      assert.equal(build({ progress_stage: 'อะไรก็ไม่รู้' }).payload.progress_stage, 1);
    });
  });

  describe('วันที่อัปเดตแพตช์', () => {
    test('ปฏิเสธรูปแบบวันที่ที่ไม่ถูก', () => {
      assert.equal(build({ patch_updated_at: '21/08/2026' }).ok, false);
    });

    test('รับรูปแบบ ปี-เดือน-วัน', () => {
      assert.equal(build({ patch_updated_at: '2026-08-21' }).payload.patch_updated_at, '2026-08-21');
    });
  });

  test('รวมข้อผิดพลาดทุกช่องมาให้ทีเดียว ไม่ใช่บอกทีละอัน', () => {
    const result = buildGamePayload({ status: 'ready' });
    assert.equal(result.ok, false);
    assert.ok(Object.keys(result.errors).length >= 4, 'ควรบอกหลายช่องพร้อมกัน');
  });
});

describe('แปล error จากฐานข้อมูล', () => {
  test('ชื่อย่อซ้ำ', () => {
    assert.match(
      explainSaveError({ code: '23505', message: 'duplicate key value violates unique constraint "games_slug_key"' }),
      /มีเกมอื่นใช้ไปแล้ว/
    );
  });

  test('เกมพร้อมแปะแต่ไม่มีแพตช์', () => {
    assert.match(
      explainSaveError({ message: 'violates check constraint "ready_games_need_a_patch"' }),
      /ต้องมีทั้งลิงก์/
    );
  });

  test('ไม่มีสิทธิ์แก้ข้อมูล', () => {
    assert.match(explainSaveError({ code: '42501', message: 'permission denied' }), /ไม่มีสิทธิ์/);
  });

  test('error ที่ไม่รู้จักก็ยังส่งข้อความเดิมออกไป ไม่กลืนหาย', () => {
    assert.equal(explainSaveError({ message: 'บางอย่างพัง' }), 'บางอย่างพัง');
  });

  test('ไม่มี error object ก็ไม่พัง', () => {
    assert.match(explainSaveError(null), /บันทึกไม่สำเร็จ/);
  });
});
