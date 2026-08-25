-- แอดมินลบรายงานบั๊ก (และไฟล์แนบของมัน) ได้
-- เดิมมีแค่ select/update ไว้ให้แอดมิน ลืมเผื่อกรณีลบรายงานทดสอบ/สแปม/ลบเสร็จแล้ว

create policy "แอดมินลบรายงานบั๊กได้"
  on bug_reports for delete to authenticated using (is_admin());

create policy "แอดมินลบไฟล์แนบบั๊กได้"
  on storage.objects for delete to authenticated
  using (bucket_id = 'bug-reports' and public.is_admin());
