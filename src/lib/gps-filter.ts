/**
 * Lọc điểm GPS thuần — tách riêng để dễ unit test.
 * Dùng chung cho foreground hook + background task.
 */

/** Ngưỡng dịch chuyển tối thiểu (mét) so với điểm cuối đã push */
export const MIN_DISTANCE_M = 20;

export interface GeoPoint {
  lat: number;
  lng: number;
}

/** Tính khoảng cách Haversine giữa 2 điểm (mét) */
export function haversineDistance(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6_371_000; // Bán kính trái đất (mét)
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Kiểm tra xem location có đáng push không.
 *
 * Chỉ dựa trên khoảng cách so với điểm cuối đã push (không dùng speed):
 * GPS khi đứng yên thường báo speed ảo 1-3 m/s, nên quy tắc "speed cao → push"
 * khiến điểm drift được ghi liên tục — tăng sai điểm GPS và kéo dài sai
 * thời lượng trên History. Với distanceInterval 30m, điểm di chuyển thật luôn
 * cách điểm trước >= 20m nên vẫn được push đầy đủ.
 */
export function shouldPush(
  lat: number,
  lng: number,
  lastPushed: GeoPoint | null,
): boolean {
  // Điểm đầu tiên luôn push
  if (lastPushed == null) return true;

  const dist = haversineDistance(lastPushed.lat, lastPushed.lng, lat, lng);
  return dist >= MIN_DISTANCE_M;
}
