-- ============================================================
-- Location Tracking App — Database Schema
-- ============================================================
-- Chạy script này trong Supabase SQL Editor (Dashboard → SQL Editor)
-- ============================================================

-- 1. Bảng trips — lưu thông tin hành trình
CREATE TABLE IF NOT EXISTS trips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  name text,
  is_active boolean NOT NULL DEFAULT false
);

-- 2. Bảng locations — lưu các điểm GPS của hành trình
CREATE TABLE IF NOT EXISTS locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id uuid NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  lat double precision NOT NULL,
  lng double precision NOT NULL,
  speed double precision,
  timestamp timestamptz NOT NULL DEFAULT now()
);

-- 3. Index cho truy vấn nhanh theo trip_id
CREATE INDEX IF NOT EXISTS idx_locations_trip_id ON locations(trip_id);
CREATE INDEX IF NOT EXISTS idx_locations_timestamp ON locations(timestamp);

-- 4. Row Level Security
ALTER TABLE trips ENABLE ROW LEVEL SECURITY;
ALTER TABLE locations ENABLE ROW LEVEL SECURITY;

-- Policy: cho phép INSERT không cần auth (tracker push lên)
DROP POLICY IF EXISTS "allow_public_insert_trips" ON trips;
CREATE POLICY "allow_public_insert_trips"
  ON trips FOR INSERT
  TO anon
  WITH CHECK (true);

-- Policy: cho phép SELECT public (viewer xem được)
DROP POLICY IF EXISTS "allow_public_select_trips" ON trips;
CREATE POLICY "allow_public_select_trips"
  ON trips FOR SELECT
  TO anon
  USING (true);

-- Policy: cho phép UPDATE (cập nhật is_active khi dừng hành trình)
DROP POLICY IF EXISTS "allow_public_update_trips" ON trips;
CREATE POLICY "allow_public_update_trips"
  ON trips FOR UPDATE
  TO anon
  USING (true)
  WITH CHECK (true);

-- Policy: cho phép INSERT không cần auth (tracker push location lên)
DROP POLICY IF EXISTS "allow_public_insert_locations" ON locations;
CREATE POLICY "allow_public_insert_locations"
  ON locations FOR INSERT
  TO anon
  WITH CHECK (true);

-- Policy: cho phép SELECT public theo trip_id
DROP POLICY IF EXISTS "allow_public_select_locations" ON locations;
CREATE POLICY "allow_public_select_locations"
  ON locations FOR SELECT
  TO anon
  USING (true);

-- 5. Bật Realtime cho bảng locations (để web viewer cập nhật realtime)
ALTER PUBLICATION supabase_realtime ADD TABLE locations;
