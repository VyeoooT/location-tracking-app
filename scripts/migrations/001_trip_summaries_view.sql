-- ============================================================
-- Migration 001 — View trip_summaries (LT-19)
-- ============================================================
-- Tối ưu history screen: gộp count + first/last timestamp của mỗi trip
-- từ 3N queries xuống còn 1 query.
--
-- Cách chạy: Supabase Dashboard → SQL Editor → paste script này → Run.
--
-- Lưu ý:
-- - security_invoker = true → view chạy theo RLS của role gọi (anon) nên
--   policy select public của trips/locations vẫn được áp dụng như cũ.
-- - LEFT JOIN → trip chưa có location vẫn hiển thị với point_count = 0.
-- ============================================================

CREATE OR REPLACE VIEW trip_summaries
WITH (security_invoker = true) AS
SELECT
  t.id,
  t.created_at,
  t.name,
  t.is_active,
  COUNT(l.id)::int AS point_count,
  MIN(l.timestamp) AS first_ts,
  MAX(l.timestamp) AS last_ts
FROM trips t
LEFT JOIN locations l ON l.trip_id = t.id
GROUP BY t.id;

GRANT SELECT ON trip_summaries TO anon;
