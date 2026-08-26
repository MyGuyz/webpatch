-- เอาระบบแนะนำ/โหวตเกมออกทั้งหมด (ตัดสินใจถอยกลับ ดู ADR-012 สำหรับเหตุผลตอนเพิ่ม)
-- ลบตามลำดับที่ไม่ชนกับ foreign key: ฟังก์ชัน -> ตารางที่อ้างอิง -> ตารางหลัก

drop function if exists increment_game_request_vote(bigint);
drop table if exists game_request_votes;
drop table if exists game_requests;
