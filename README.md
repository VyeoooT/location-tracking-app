# Location Tracker

Ứng dụng ghi nhận vị trí nền trên Android kèm web viewer chia sẻ hành trình theo thời gian thực.

- **App** (Expo / React Native / TypeScript): track GPS nền, lưu vào Supabase, chia sẻ link xem trực tiếp.
- **Viewer** (`/viewer`): bản đồ web (React + Vite + Leaflet) hiển thị vị trí realtime theo link `/trip/:tripId`.

## Cấu trúc dự án

```
src/                       # App Expo (TypeScript)
  app/                     # Màn hình (expo-router)
    (tabs)/                # Home, History, Guide
    tracking.tsx           # Màn hình theo dõi khi đang chạy
  components/              # UI components (themed, tabs, banner, ...)
  hooks/                   # useLocationTracking (background GPS), useNetworkStatus, ...
  lib/                     # supabase client, async-storage, location-queue
  __tests__/               # Jest tests
scripts/init.sql           # Schema Supabase (trips, locations, RLS, Realtime)
scripts/migrations/        # Migration SQL — chạy theo thứ tự sau init
viewer/                    # Web viewer (React + Vite + Leaflet)
```

## Yêu cầu

- Node.js 20+, [Bun](https://bun.sh) (dùng cho test/script)
- Expo SDK 57 + [EAS CLI](https://docs.expo.dev/eas/) để build APK
- Một Supabase project (https://supabase.com)

## 1. Setup Supabase

1. Tạo project tại supabase.com, lưu lại **Project URL** và **anon key**.
2. Mở **Supabase Dashboard → SQL Editor** và chạy lần lượt:
   - `scripts/init.sql` — tạo bảng `trips` / `locations`, index, RLS, bật Realtime.
   - Từng file trong `scripts/migrations/` theo thứ tự số (vd `001_trip_summaries_view.sql`).
3. Kiểm tra Realtime của bảng `locations` đã bật (Dashboard → Database → Replication).

## 2. Cấu hình .env

```bash
cp .env.example .env
```

| Biến | Mô tả |
| --- | --- |
| `EXPO_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key |
| `EXPO_PUBLIC_VIEWER_URL` | Base URL viewer, dạng `https://your-domain.com/trip` |

> Biến `EXPO_PUBLIC_*` được nhúng vào app lúc build. Không commit file `.env`.

## 3. Chạy app

```bash
bun install
bunx expo start
```

Trên Android thật (device đã bật USB debugging): `bun run android` — tự `adb reverse` rồi `expo run:android`.

## 4. Kiểm tra chất lượng

```bash
bun run test        # Jest (tests trong src/__tests__)
bun run lint        # ESLint
bunx tsc --noEmit   # TypeScript
bunx expo export --platform web   # kiểm tra bundle web
```

## 5. Build APK

Cấu hình EAS sẵn trong `eas.json` (profile `preview` = APK internal):

```bash
eas build --platform android --profile preview
```

## 6. Web viewer

```bash
cd viewer
bun install
bun run dev        # chạy local
bun run build      # build production
```

Deploy lên Vercel: kết nối repo, root directory = `viewer/`, framework = Vite. Link chia sẻ có dạng `https://<domain>/trip/<tripId>` — điền vào `EXPO_PUBLIC_VIEWER_URL` ở bước 2.

## Lưu ý

- App cần quyền **background location**: `ACCESS_FINE_LOCATION`, `ACCESS_BACKGROUND_LOCATION` và foreground service (đã cấu hình trong `app.json`).
- Một số máy Android tối ưu pin có thể kill app nền — xem màn hình **Hướng dẫn sử dụng** trong app để bật "Không giới hạn" cho pin.
- Khi schema thay đổi: viết migration mới trong `scripts/migrations/` và chạy trên Supabase, đừng sửa lại `init.sql`.
