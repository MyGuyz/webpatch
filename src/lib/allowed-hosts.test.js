import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { isAllowedPatchHost } from './allowed-hosts.js';

describe('ตัวกรองที่อยู่ไฟล์แพตช์', () => {
  test('ผ่านเมื่อเป็นปลายทางของ GitHub ผ่าน https', () => {
    for (const url of [
      'https://github.com/MyGuyz/webpatch/releases/download/v1/game.ips',
      'https://objects.githubusercontent.com/x',
      'https://release-assets.githubusercontent.com/x',
      'https://raw.githubusercontent.com/MyGuyz/webpatch/main/x.bps',
    ]) {
      assert.equal(isAllowedPatchHost(url), true, url);
    }
  });

  test('ปฏิเสธโดเมนอื่น', () => {
    assert.equal(isAllowedPatchHost('https://evil.example.com/x.ips'), false);
  });

  test('ปฏิเสธ http ที่ไม่เข้ารหัส', () => {
    assert.equal(isAllowedPatchHost('http://github.com/x.ips'), false);
  });

  test('ปฏิเสธโดเมนที่แค่ลงท้ายคล้ายกัน', () => {
    assert.equal(isAllowedPatchHost('https://github.com.evil.net/x'), false);
    assert.equal(isAllowedPatchHost('https://notgithub.com/x'), false);
  });

  test('ปฏิเสธการยิงเข้าเครือข่ายภายในและ protocol แปลกๆ', () => {
    assert.equal(isAllowedPatchHost('https://localhost/x'), false);
    assert.equal(isAllowedPatchHost('https://169.254.169.254/latest/meta-data'), false);
    assert.equal(isAllowedPatchHost('file:///etc/passwd'), false);
    assert.equal(isAllowedPatchHost('data:text/plain,hi'), false);
  });

  test('ปฏิเสธค่าที่ไม่ใช่ URL', () => {
    assert.equal(isAllowedPatchHost(''), false);
    assert.equal(isAllowedPatchHost('ไม่ใช่ลิงก์'), false);
    assert.equal(isAllowedPatchHost(null), false);
  });
});
