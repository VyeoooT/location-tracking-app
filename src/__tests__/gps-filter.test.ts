import { haversineDistance, shouldPush } from '@/lib/gps-filter';

// 1 độ vĩ ≈ 111.320 m
const mToLat = (m: number) => m / 111_320;

describe('haversineDistance', () => {
  it('returns 0 for the same point', () => {
    expect(haversineDistance(10.5, 106.6, 10.5, 106.6)).toBe(0);
  });

  it('returns ~30m for ~30m of latitude', () => {
    const dist = haversineDistance(10.5, 106.6, 10.5 + mToLat(30), 106.6);
    expect(dist).toBeGreaterThan(29);
    expect(dist).toBeLessThan(31);
  });
});

describe('shouldPush (chống GPS drift khi đứng yên)', () => {
  it('luôn push điểm đầu tiên khi chưa có điểm tham chiếu', () => {
    expect(shouldPush(10.5, 106.6, null)).toBe(true);
  });

  it('push khi dịch chuyển thật sự vượt ngưỡng tối thiểu', () => {
    // ~50m so với điểm cuối đã push
    expect(
      shouldPush(10.5, 106.6, { lat: 10.5 + mToLat(50), lng: 106.6 }),
    ).toBe(true);
  });

  it('không push khi GPS drift nhỏ hơn ngưỡng (đứng yên)', () => {
    // drift ~8m — Android GPS hay nhảy lên vài mét dù đứng yên
    expect(shouldPush(10.5, 106.6, { lat: 10.5 + mToLat(8), lng: 106.6 })).toBe(
      false,
    );
  });

  it('không push drift dù GPS báo speed ảo cao (regression LT-20)', () => {
    // Trước đây speed >= 1 m/s khiến điểm drift bị push → điểm GPS tăng dù đứng yên
    expect(
      shouldPush(10.5, 106.6, { lat: 10.5 + mToLat(12), lng: 106.6 }),
    ).toBe(false);
  });
});
