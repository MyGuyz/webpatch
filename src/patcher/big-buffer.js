/**
 * BigBuffer — เก็บข้อมูลไบต์ก้อนใหญ่ (อาจเกิน ~2GB) โดยแบ่งเป็นหลาย Uint8Array/ArrayBuffer
 * ย่อย (segment) แทนที่จะเป็น ArrayBuffer เดียว
 *
 * เบราว์เซอร์ (ยืนยันแล้วทั้ง Chrome และ Firefox) ปฏิเสธ ArrayBuffer เดี่ยวที่ใหญ่กว่า ~2GB
 * เสมอ ไม่ว่าจะมีแรมเหลือแค่ไหนก็ตาม (ดู ADR-014/ADR-015) ไฟล์ ISO ของ PS2/DVD มักใหญ่กว่านี้
 * ตัวแปะแพตช์ (IPS/BPS/PPF) จึงใช้ Uint8Array ตรงๆ กับไฟล์ขนาดนี้ไม่ได้อีกต่อไป ต้องมีชั้น
 * ที่ทำให้อ่าน/เขียนแบบสุ่มตำแหน่ง (random access) ข้าม segment ได้โปร่งใส เหมือนใช้ Uint8Array
 * ก้อนเดียวอยู่ (ดู ADR-016)
 *
 * ทุก segment ยาวเท่ากับ segmentBytes เป๊ะ ยกเว้นตัวสุดท้ายที่อาจสั้นกว่า (invariant นี้ทำให้
 * คำนวณว่า position ไหนอยู่ segment ไหนด้วยการหารตรงๆ ได้ ไม่ต้องไล่บวกทีละ segment)
 */

const DEFAULT_SEGMENT_BYTES = 512 * 1024 * 1024; // 512MB — ห่างจากเพดาน ~2GB ของเบราว์เซอร์มากพอ

export class BigBuffer {
  /** สร้าง BigBuffer ว่างเปล่า (เติมศูนย์) ยาว length ไบต์ */
  constructor(length, segmentBytes = DEFAULT_SEGMENT_BYTES) {
    if (!Number.isInteger(segmentBytes) || segmentBytes <= 0) {
      throw new Error('segmentBytes ต้องเป็นจำนวนเต็มมากกว่า 0');
    }
    this.length = length;
    this.segmentBytes = segmentBytes;
    this.segments = [];
    let remaining = length;
    while (remaining > 0) {
      const size = Math.min(segmentBytes, remaining);
      this.segments.push(new Uint8Array(size));
      remaining -= size;
    }
  }

  /** ห่อ Uint8Array ธรรมดาที่มีอยู่แล้วเป็น BigBuffer (ใช้กับไฟล์แพตช์ที่ไม่ใหญ่ หรือในเทส) */
  static fromUint8Array(bytes, segmentBytes = DEFAULT_SEGMENT_BYTES) {
    const buffer = Object.create(BigBuffer.prototype);
    buffer.length = bytes.length;
    buffer.segmentBytes = segmentBytes;
    buffer.segments = [];
    for (let offset = 0; offset < bytes.length; offset += segmentBytes) {
      buffer.segments.push(bytes.slice(offset, Math.min(offset + segmentBytes, bytes.length)));
    }
    return buffer;
  }

  /**
   * อ่านไฟล์/Blob ทีละก้อนสร้างเป็น BigBuffer โดยไม่อ่านทั้งไฟล์เป็น ArrayBuffer เดียว
   * (ตัว Blob.slice() ไม่อ่านข้อมูลจริงจนกว่าจะเรียก .arrayBuffer() จึงเปิดก้อนทีละก้อนได้)
   */
  static async fromBlob(blob, segmentBytes = DEFAULT_SEGMENT_BYTES, onProgress) {
    const buffer = Object.create(BigBuffer.prototype);
    buffer.length = blob.size;
    buffer.segmentBytes = segmentBytes;
    buffer.segments = [];
    for (let offset = 0; offset < blob.size; offset += segmentBytes) {
      const end = Math.min(offset + segmentBytes, blob.size);
      const chunk = blob.slice(offset, end);
      buffer.segments.push(new Uint8Array(await chunk.arrayBuffer()));
      onProgress?.(end, blob.size);
      await yieldToBrowser();
    }
    return buffer;
  }

  /**
   * ตำแหน่งของไบต์ที่ pos อยู่ segment ไหน คืนเป็น [segmentIndex, positionในSegmentนั้น]
   *
   * ตั้งใจไม่ใช้ private class field (#locate) เพราะ instance ที่สร้างผ่าน
   * `Object.create(BigBuffer.prototype)` ใน fromUint8Array/fromBlob (ข้าม constructor
   * เพื่อกำหนด length/segments เองหลังอ่านข้อมูลเสร็จ) จะไม่มี private brand ติดตัวมาด้วย
   * เรียก private method จาก instance แบบนั้นไม่ได้ (throw "Receiver must be an instance") —
   * ใช้ method ธรรมดาแทนเพื่อให้เรียกได้จากทุกทางที่สร้าง instance
   */
  locate(pos) {
    const segIndex = Math.floor(pos / this.segmentBytes);
    return [segIndex, pos - segIndex * this.segmentBytes];
  }

  readByte(pos) {
    const [segIndex, posInSeg] = this.locate(pos);
    return this.segments[segIndex][posInSeg];
  }

  writeByte(pos, value) {
    const [segIndex, posInSeg] = this.locate(pos);
    this.segments[segIndex][posInSeg] = value;
  }

  /** อ่านหลายไบต์ อาจข้าม segment ได้ — คืน Uint8Array ใหม่เสมอ (สำเนา ไม่ใช่ view) */
  read(start, length) {
    const result = new Uint8Array(length);
    let [segIndex, posInSeg] = this.locate(start);
    let written = 0;
    while (written < length) {
      const seg = this.segments[segIndex];
      const take = Math.min(seg.length - posInSeg, length - written);
      result.set(seg.subarray(posInSeg, posInSeg + take), written);
      written += take;
      segIndex++;
      posInSeg = 0;
    }
    return result;
  }

  /** เขียนทับหลายไบต์ อาจข้าม segment ได้ */
  write(start, bytes) {
    let [segIndex, posInSeg] = this.locate(start);
    let written = 0;
    while (written < bytes.length) {
      const seg = this.segments[segIndex];
      const take = Math.min(seg.length - posInSeg, bytes.length - written);
      seg.set(bytes.subarray(written, written + take), posInSeg);
      written += take;
      segIndex++;
      posInSeg = 0;
    }
  }

  /** เติมค่าเดียวกันซ้ำในช่วง [start, end) อาจข้าม segment ได้ */
  fill(value, start, end) {
    let [segIndex, posInSeg] = this.locate(start);
    let written = 0;
    const length = end - start;
    while (written < length) {
      const seg = this.segments[segIndex];
      const take = Math.min(seg.length - posInSeg, length - written);
      seg.fill(value, posInSeg, posInSeg + take);
      written += take;
      segIndex++;
      posInSeg = 0;
    }
  }

  /**
   * คัดลอกไบต์จากตำแหน่ง srcStart ไป dstStart ยาว length ไบต์ ภายใน BigBuffer เดียวกัน
   * ทำทีละไบต์ตามลำดับต้นทาง→ปลายทาง (เหมือน JS `for` loop ตรงๆ) เพื่อให้ถูกต้องแม้ช่วง
   * ต้นทาง/ปลายทางซ้อนทับกัน (BPS ใช้ลักษณะนี้ทำ RLE โดยตั้งใจ — ดู bps.js)
   */
  copyWithinSelf(dstStart, srcStart, length) {
    for (let i = 0; i < length; i++) {
      this.writeByte(dstStart + i, this.readByte(srcStart + i));
    }
  }

  /** ขยายความยาวเป็น newLength (เติมศูนย์ตรงส่วนที่ขยาย) ถ้า newLength <= length ไม่ทำอะไร */
  grow(newLength) {
    if (newLength <= this.length) return;

    const lastIndex = this.segments.length - 1;
    if (lastIndex >= 0) {
      const last = this.segments[lastIndex];
      if (last.length < this.segmentBytes) {
        const wantLength = Math.min(this.segmentBytes, last.length + (newLength - this.length));
        const grown = new Uint8Array(wantLength);
        grown.set(last);
        this.segments[lastIndex] = grown;
      }
    }

    let currentLength = this.segments.reduce((sum, s) => sum + s.length, 0);
    while (currentLength < newLength) {
      const size = Math.min(this.segmentBytes, newLength - currentLength);
      this.segments.push(new Uint8Array(size));
      currentLength += size;
    }
    this.length = newLength;
  }

  /** ตัดให้สั้นลงเหลือ newLength ไบต์ (newLength ต้อง <= length เดิม) */
  truncate(newLength) {
    if (newLength >= this.length) return;

    let currentLength = 0;
    const newSegments = [];
    for (const seg of this.segments) {
      if (currentLength >= newLength) break;
      const remaining = newLength - currentLength;
      if (seg.length <= remaining) {
        newSegments.push(seg);
        currentLength += seg.length;
      } else {
        newSegments.push(seg.subarray(0, remaining));
        currentLength += remaining;
      }
    }
    this.segments = newSegments;
    this.length = newLength;
  }

  /** ทำสำเนาทั้งก้อนที่แก้ไขได้โดยไม่กระทบต้นฉบับ */
  clone() {
    const copy = Object.create(BigBuffer.prototype);
    copy.length = this.length;
    copy.segmentBytes = this.segmentBytes;
    copy.segments = this.segments.map((seg) => seg.slice());
    return copy;
  }

  /** รวมเป็น Blob เดียว (ไม่ต้องรวมเป็น ArrayBuffer เดียวก่อน — เบราว์เซอร์รองรับ Blob ที่ใหญ่กว่าแรมได้เอง) */
  toBlob(type = 'application/octet-stream') {
    return new Blob(this.segments, { type });
  }
}

function yieldToBrowser() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}
