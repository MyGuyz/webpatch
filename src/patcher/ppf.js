/**
 * PPF — เขียนทับแผ่นเกมเป็นจุดๆ (มาตรฐานของแผ่น PS1/PS2)
 * รองรับทั้ง 3 รุ่น: PPF1.0, PPF2.0, PPF3.0
 *
 * ต่างกันตรงส่วนหัวและขนาดของ offset เท่านั้น ส่วนเนื้อเรคคอร์ดเหมือนกัน
 *
 * `source` เป็น BigBuffer (ดู big-buffer.js) ไม่ใช่ Uint8Array ตรงๆ เพราะแผ่น PS2 มักใหญ่กว่า
 * ~2GB ที่ ArrayBuffer เดียวถืออยู่ไม่ได้ — `patch` (ตัวไฟล์ .ppf เอง) ยังเป็น Uint8Array ปกติ
 * เพราะเป็นไฟล์ diff เล็กกว่ามาก ไม่ชนเพดานนี้
 *
 * เขียนทับ `source` ตรงๆ แล้วคืนตัวมันเอง (ไม่ clone ก่อน) — ผู้เรียกห้ามใช้ `source` เดิมต่อ
 * หลังเรียกฟังก์ชันนี้ ตั้งใจแลกมาเพื่อลดแรมพีคที่ต้องใช้ครึ่งหนึ่ง (ไฟล์ระดับ PS2 เต็มแผ่น
 * การ clone ก่อนเขียนจะต้องมีทั้งต้นฉบับและสำเนาอยู่พร้อมกันชั่วขณะ กินแรมพีคเป็น ~2 เท่าของ
 * ขนาดไฟล์โดยไม่จำเป็น ทั้งที่ในการใช้งานจริง (patch-ui.js) ตัว source ที่ส่งเข้ามาถูกสร้างขึ้น
 * มาเพื่อแปะแพตช์ครั้งนี้ครั้งเดียวอยู่แล้ว ไม่มีใครต้องใช้ค่าดิบต่อ)
 *
 * ตัวแกะเรคคอร์ด (parsePPFRecords) แยกออกมาจากตัวเขียนทับ (applyPPF) เพื่อให้ทางสตรีม
 * (streamApplyPPF ใน stream-ppf.js — ใช้กับ Android ผ่าน File System Access API เพราะ
 * Safari ไม่รองรับ API นี้เลย ดู ADR-017) เรียกใช้ตรรกะแกะไฟล์เดียวกันได้ ไม่ต้องเขียนซ้ำ
 * สองที่จนเสี่ยงเพี้ยนคนละแบบ
 */

const DESCRIPTION_LENGTH = 50;
const BLOCK_CHECK_LENGTH = 1024;

/**
 * แกะ header ของไฟล์ .ppf แล้วคืนรายการเรคคอร์ด { offset, data } เรียงจาก offset น้อยไปมาก
 * (สเปกไม่ได้การันตีลำดับ แต่ตัวสร้างแพตช์ทั่วไปเรียงมาให้อยู่แล้ว — เรียงซ้ำเองให้ชัวร์)
 *
 * ไม่ตรวจ "เขียนเลยท้ายไฟล์ต้นฉบับ" ในนี้ เพราะตอนแกะยังไม่รู้ขนาดไฟล์ต้นฉบับจริง
 * (ฝั่งเรียกใช้ที่รู้ขนาดไฟล์แล้วต้องตรวจเอง)
 */
export function parsePPFRecords(patch) {
  const version = readVersion(patch);
  let pos = 5 + 1 + DESCRIPTION_LENGTH;
  let offsetSize;
  let hasUndoData = false;
  let expectedSourceSize = null;

  if (version === 1) {
    // magic(5) + encoding(1) + description(50)
    offsetSize = 4;
  } else if (version === 2) {
    // magic(5) + encoding(1) + description(50) + ขนาดไฟล์ต้นฉบับ(4) + block check(1024)
    expectedSourceSize = readUint32LE(patch, pos);
    pos += 4 + BLOCK_CHECK_LENGTH;
    offsetSize = 4;
  } else {
    // magic(5) + encoding(1) + description(50) + imagetype(1) + blockcheck(1) + undo(1) + dummy(1)
    const blockCheckPresent = patch[pos + 1] === 1;
    hasUndoData = patch[pos + 2] === 1;
    pos += 4;
    if (blockCheckPresent) pos += BLOCK_CHECK_LENGTH;
    offsetSize = 8;
  }

  const end = findRecordsEnd(patch, version);
  const records = [];

  while (pos < end) {
    if (pos + offsetSize + 1 > end) {
      throw new Error('ไฟล์แพตช์ PPF ขาดกลางคัน (เรคคอร์ดไม่ครบ)');
    }

    const offset = offsetSize === 8 ? readUint64LE(patch, pos) : readUint32LE(patch, pos);
    pos += offsetSize;

    const size = patch[pos++];
    if (pos + size > end) {
      throw new Error('ไฟล์แพตช์ PPF ขาดกลางคัน (ข้อมูลไม่ครบ)');
    }

    records.push({ offset, data: patch.subarray(pos, pos + size) });
    pos += size;

    // PPF3.0 ที่เปิด undo จะแนบข้อมูลเดิมไว้ท้ายเรคคอร์ด สำหรับย้อนกลับ — เราข้ามไป
    if (hasUndoData) pos += size;
  }

  records.sort((a, b) => a.offset - b.offset);
  return { version, expectedSourceSize, records };
}

export function applyPPF(source, patch) {
  const { expectedSourceSize, records } = parsePPFRecords(patch);

  if (expectedSourceSize != null && source.length !== expectedSourceSize) {
    throw new Error(
      `ขนาดไฟล์ต้นฉบับไม่ตรงกับที่แพตช์ต้องการ (ต้องการ ${expectedSourceSize} ไบต์ แต่ได้ ${source.length} ไบต์)`
    );
  }

  const out = source;
  for (const rec of records) {
    if (rec.offset + rec.data.length > out.length) {
      throw new Error(
        'แพตช์พยายามเขียนเลยท้ายไฟล์ต้นฉบับ — น่าจะใช้ไฟล์เกมผิดรุ่นหรือผิดรูปแบบการ dump'
      );
    }
    out.write(rec.offset, rec.data);
  }

  return out;
}

function readVersion(patch) {
  const magic = String.fromCharCode(patch[0], patch[1], patch[2], patch[3], patch[4]);
  if (magic === 'PPF10') return 1;
  if (magic === 'PPF20') return 2;
  if (magic === 'PPF30') return 3;
  throw new Error('ไฟล์แพตช์ PPF ไม่ถูกต้อง (ไม่พบหัวไฟล์ PPF10/PPF20/PPF30)');
}

/**
 * PPF3.0 อาจมีบล็อก "@BEGIN_FILE_ID.DIZ" ต่อท้ายไว้เก็บคำอธิบาย
 * ซึ่งไม่ใช่เรคคอร์ด ต้องตัดออกก่อนไม่งั้นจะอ่านเป็นข้อมูลแล้วพัง
 */
function findRecordsEnd(patch, version) {
  if (version !== 3) return patch.length;

  const marker = '@BEGIN_FILE_ID.DIZ';
  const searchFrom = Math.max(0, patch.length - 4096);

  for (let i = patch.length - marker.length; i >= searchFrom; i--) {
    let matched = true;
    for (let j = 0; j < marker.length; j++) {
      if (patch[i + j] !== marker.charCodeAt(j)) {
        matched = false;
        break;
      }
    }
    if (matched) return i;
  }
  return patch.length;
}

function readUint32LE(bytes, pos) {
  return (
    (bytes[pos] | (bytes[pos + 1] << 8) | (bytes[pos + 2] << 16) | (bytes[pos + 3] << 24)) >>> 0
  );
}

function readUint64LE(bytes, pos) {
  // แผ่นเกมไม่เกิน 8GB อยู่แล้ว จึงประกอบจาก 32 บิตล่างกับบนได้โดยไม่เสียความแม่นยำ
  const low = readUint32LE(bytes, pos);
  const high = readUint32LE(bytes, pos + 4);
  return high * 0x100000000 + low;
}
