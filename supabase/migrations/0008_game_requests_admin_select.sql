-- แอดมินต้องเห็นคำขอเกมทุกสถานะ รวมถึง declined ด้วย
-- policy เดิมใน 0007 ให้อ่านได้เฉพาะ status <> 'declined' (สำหรับผู้ใช้ทั่วไป)
-- ถ้าไม่มี policy นี้เพิ่ม แอดมินจะมองไม่เห็นคำขอที่ตัวเองเพิ่งกดปฏิเสธไปเลย

create policy "แอดมินอ่านคำขอเกมได้ทุกแถว"
  on game_requests for select to authenticated using (is_admin());
