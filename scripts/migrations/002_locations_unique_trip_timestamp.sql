-- ============================================================
-- Migration 002 — Unique index (trip_id, timestamp) cho locations
-- ============================================================
-- Mục đích: chống ghi trùng điểm GPS khi flush queue (cơ chế at-least-once).
-- App dùng upsert với onConflict: 'trip_id,timestamp' + ignoreDuplicates: true,
-- nên bắt buộc phải có unique index/constraint tương ứng.
--
-- Cách chạy: Supabase Dashboard → SQL Editor → paste script này → Run.
-- Thứ tự triển khai: chạy migration này TRƯỚC khi phát hành bản app mới,
-- vì upsert sẽ lỗi nếu chưa có unique index.
-- ============================================================

-- 1. Dọn dữ liệu trùng đã phát sinh trước đây.
--    Giữ lại 1 dòng cho mỗi cặp (trip_id, timestamp), các dòng còn lại xoá.
DELETE FROM locations
WHERE id IN (
  SELECT id
  FROM (
    SELECT
      id,
      row_number() OVER (
        PARTITION BY trip_id, timestamp
        ORDER BY id
      ) AS row_num
    FROM locations
  ) duplicates
  WHERE row_num > 1
);

-- 2. Unique index dùng cho ON CONFLICT (trip_id, timestamp).
CREATE UNIQUE INDEX IF NOT EXISTS idx_locations_trip_timestamp
  ON locations (trip_id, timestamp);
