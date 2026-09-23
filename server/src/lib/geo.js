const R = 6371;
const rad = (d) => (d * Math.PI) / 180;

export function haversineKm([lng1, lat1], [lng2, lat2]) {
  const dLat = rad(lat2 - lat1);
  const dLng = rad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// MTC-01: proximity must use travel time, not straight-line distance. Without a
// routing provider configured we estimate it from a road-network detour factor
// and urban two-wheeler speed. Swap `estimateTravelMin` for a Maps Distance
// Matrix call in production — every caller already consumes minutes.
const ROAD_FACTOR = 1.35;
const URBAN_KMPH = 18;
const FIXED_MIN = 3; // parking, gate entry, lift

export function estimateTravelMin(km) {
  return Math.round(FIXED_MIN + ((km * ROAD_FACTOR) / URBAN_KMPH) * 60);
}

export const point = (lng, lat) => ({ type: 'Point', coordinates: [Number(lng), Number(lat)] });

export function isValidCoords(lng, lat) {
  return Number.isFinite(+lng) && Number.isFinite(+lat) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
}

// NBY-04: customers only see approximate distance, rounded to 0.5 km.
export const approxKm = (km) => Math.max(0.5, Math.round(km * 2) / 2);
