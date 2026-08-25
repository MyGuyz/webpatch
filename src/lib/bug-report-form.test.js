import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { buildBugReportPayload, validateFiles, MAX_IMAGE_BYTES, MAX_VIDEO_BYTES } from './bug-report-form.js';

const image = (overrides = {}) => ({
  name: 'screenshot.png',
  type: 'image/png',
  size: 1024,
  ...overrides,
});

const valid = {
  game_id: '3',
  patch_version: 'V1.0',
  description: 'ข้อความบทที่ 3 เป็นภาษาอังกฤษ',
  where_in_game: 'บทที่ 3',
  emulator: 'DuckStation',
  wrong_text: 'Hello World',
  contact: 'me@example.com',
};

const build = (overrides = {}, files = [image()]) =>
  buildBugReportPayload({ ...valid, ...overrides }, files);

describe('ฟอร์มแจ้งบั๊ก', () => {
  test('ฟอร์มที่กรอกครบผ่าน และแปลงชนิดข้อมูลให้ถูก', () => {
    const result = build();
    assert.equal(result.ok, true);
    assert.equal(result.payload.game_id, 3);
    assert.equal(result.payload.patch_version, 'V1.0');
  });

  test('ช่องเสริมที่เว้นว่างกลายเป็น null', () => {
    const { payload } = build({ where_in_game: '', emulator: undefined, wrong_text: '  ', contact: '' });
    assert.equal(payload.where_in_game, null);
    assert.equal(payload.emulator, null);
    assert.equal(payload.wrong_text, null);
    assert.equal(payload.contact, null);
  });

  test('ต้องเลือกเกม', () => {
    const result = build({ game_id: '' });
    assert.equal(result.ok, false);
    assert.ok(result.errors.game_id);
  });

  test('ต้องเลือกเวอร์ชัน', () => {
    const result = build({ patch_version: '' });
    assert.equal(result.ok, false);
    assert.ok(result.errors.patch_version);
  });

  test('ต้องกรอกรายละเอียด', () => {
    const result = build({ description: '   ' });
    assert.equal(result.ok, false);
    assert.ok(result.errors.description);
  });

  describe('ไฟล์แนบ', () => {
    test('ไม่แนบไฟล์เลยไม่ผ่าน', () => {
      const result = build({}, []);
      assert.equal(result.ok, false);
      assert.ok(result.errors.media);
    });

    test('แนบรูปอย่างเดียวก็พอ', () => {
      assert.equal(validateFiles([image()]), null);
    });

    test('แนบวิดีโอก็ได้เหมือนกัน', () => {
      assert.equal(validateFiles([image({ name: 'clip.mp4', type: 'video/mp4', size: 1024 })]), null);
    });

    test('ไฟล์ชนิดที่ไม่รองรับถูกปฏิเสธ', () => {
      const error = validateFiles([image({ name: 'note.txt', type: 'text/plain' })]);
      assert.ok(error);
    });

    test('รูปเกิน 15MB ถูกปฏิเสธ', () => {
      const error = validateFiles([image({ size: MAX_IMAGE_BYTES + 1 })]);
      assert.ok(error);
    });

    test('รูปพอดี 15MB ผ่านได้', () => {
      assert.equal(validateFiles([image({ size: MAX_IMAGE_BYTES })]), null);
    });

    test('วิดีโอเกิน 30MB ถูกปฏิเสธ', () => {
      const error = validateFiles([image({ name: 'clip.mp4', type: 'video/mp4', size: MAX_VIDEO_BYTES + 1 })]);
      assert.ok(error);
    });

    test('วิดีโอพอดี 30MB ผ่านได้', () => {
      assert.equal(validateFiles([image({ name: 'clip.mp4', type: 'video/mp4', size: MAX_VIDEO_BYTES })]), null);
    });

    test('หลายไฟล์ ถ้ามีไฟล์เดียวผิดก็ไม่ผ่านทั้งชุด', () => {
      const error = validateFiles([image(), image({ name: 'huge.mp4', type: 'video/mp4', size: MAX_VIDEO_BYTES + 1 })]);
      assert.ok(error);
    });
  });
});
