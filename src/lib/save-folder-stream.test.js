import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFolderSaveStream, finishFolderSave } from './save-folder-stream.js';

/** โฟลเดอร์ปลอมเลียนแบบ FileSystemDirectoryHandle ของ Chrome พอให้ทดสอบตรรกะได้:
   createWritable() เขียนลง "<name>.crswap" แล้ว close() เปลี่ยนชื่อทับไฟล์จริง —
   closeFails / moveFailsTimes จำลองอาการที่เจอจริงกับไฟล์ใหญ่กว่า 4GB */
function fakeDir({ closeFails = false, moveFailsTimes = 0, swapSize = null, finalMoveFailsTimes = 0 } = {}) {
  const files = new Map(); // name -> { size, lastModified }
  let clock = 0;
  let moveFails = moveFailsTimes;
  let finalMoveFails = finalMoveFailsTimes;
  const notFound = () => Object.assign(new Error('not found'), { name: 'NotFoundError' });
  const fileHandle = (name) => ({
    kind: 'file',
    async getFile() {
      if (!files.has(name)) throw notFound();
      return files.get(name);
    },
    async createWritable() {
      const swap = `${name}.crswap`;
      files.set(swap, { size: 0, lastModified: ++clock });
      return {
        async write(n) {
          files.get(swap).size += n;
        },
        async close() {
          if (swapSize !== null) files.get(swap).size = swapSize;
          if (closeFails) throw Object.assign(new Error('state changed'), { name: 'InvalidStateError' });
          files.set(name, files.get(swap));
          files.delete(swap);
        },
      };
    },
    async move(newName) {
      if (!name.endsWith('.crswap') && finalMoveFails > 0) {
        finalMoveFails -= 1;
        throw Object.assign(new Error('state changed'), { name: 'InvalidStateError' });
      }
      if (name.endsWith('.crswap') && moveFails > 0) {
        moveFails -= 1;
        throw Object.assign(new Error('state changed'), { name: 'InvalidStateError' });
      }
      if (files.has(newName)) throw Object.assign(new Error('exists'), { name: 'InvalidModificationError' });
      files.set(newName, files.get(name));
      files.delete(name);
    },
  });
  return {
    files,
    async getFileHandle(name, { create = false } = {}) {
      if (!files.has(name)) {
        if (!create) throw notFound();
        files.set(name, { size: 0, lastModified: ++clock });
      }
      return fileHandle(name);
    },
    async removeEntry(name) {
      if (!files.delete(name)) throw notFound();
    },
    async *entries() {
      for (const name of [...files.keys()]) yield [name, fileHandle(name)];
    },
  };
}

const noWait = async () => {};

async function save(dir, size, opts = {}) {
  const stream = await createFolderSaveStream(dir, 'Game_TH.iso');
  await stream.writable.write(size);
  const statuses = [];
  const name = await finishFolderSave(stream, opts.expected ?? size, (kind, n) => statuses.push(`${kind}${n}`), noWait);
  return { stream, name, statuses };
}

test('ผ่านปกติ: เขียนเป็น .bin แล้วเปลี่ยนชื่อเป็น .iso ไม่เหลือไฟล์อื่น', async () => {
  const dir = fakeDir();
  const { stream, name } = await save(dir, 100);
  assert.equal(stream.writeName, 'Game_TH.bin');
  assert.equal(name, 'Game_TH.iso');
  assert.deepEqual([...dir.files.keys()], ['Game_TH.iso']);
  assert.equal(dir.files.get('Game_TH.iso').size, 100);
});

test('ชื่อซ้ำไฟล์เดิม (ทั้ง .iso หรือ .bin) ไม่เขียนทับ เติม (2)/(3)', async () => {
  const dir = fakeDir();
  dir.files.set('Game_TH.iso', { size: 5, lastModified: 0 });
  dir.files.set('Game_TH (2).bin', { size: 7, lastModified: 0 });
  const { name } = await save(dir, 100);
  assert.equal(name, 'Game_TH (3).iso');
  assert.equal(dir.files.get('Game_TH.iso').size, 5);
  assert.equal(dir.files.get('Game_TH (2).bin').size, 7);
});

test('close() พัง → เปลี่ยนชื่อ .crswap เองซ้ำจนผ่าน แล้วยังได้ .iso', async () => {
  const dir = fakeDir({ closeFails: true, moveFailsTimes: 2 });
  const { name, statuses } = await save(dir, 100);
  assert.deepEqual(statuses, ['swap-retry1', 'swap-retry2', 'swap-retry3', 'rename1']);
  assert.equal(name, 'Game_TH.iso');
  assert.deepEqual([...dir.files.keys()], ['Game_TH.iso']);
});

test('เปลี่ยนชื่อเป็น .iso ไม่ผ่านเลย → คืนไฟล์ .bin ที่ครบแทน ไม่ถือว่าพัง', async () => {
  const dir = fakeDir({ finalMoveFailsTimes: 999 });
  const { name, statuses } = await save(dir, 100);
  assert.deepEqual(statuses, ['rename1']);
  assert.equal(name, 'Game_TH.bin');
  assert.equal(dir.files.get('Game_TH.bin').size, 100);
});

test('close() พังและ .crswap ขนาดไม่ครบ → โยน error เดิม ไม่เปลี่ยนชื่อไฟล์ไม่ครบให้ดูเหมือนสำเร็จ', async () => {
  const dir = fakeDir({ closeFails: true, swapSize: 60 });
  await assert.rejects(save(dir, 100), { name: 'InvalidStateError' });
  assert.ok(dir.files.has('Game_TH.bin.crswap'));
});

test('เปลี่ยนชื่อ .crswap ไม่ผ่านเลยทุกครั้ง → โยน error ออกไปหลังลองครบ', async () => {
  const dir = fakeDir({ closeFails: true, moveFailsTimes: 999 });
  await assert.rejects(save(dir, 100), { name: 'InvalidStateError' });
});
