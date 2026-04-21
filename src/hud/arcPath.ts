/** Shared SVG arc-path generator for dial gauges. */

const DEG = Math.PI / 180
const fmt = (v: number) => v.toFixed(3)

/**
 * Returns an SVG path string for a clockwise arc.
 * @param cx      Arc centre x (SVG units)
 * @param cy      Arc centre y (SVG units)
 * @param r       Radius
 * @param startDeg  Start angle in degrees (0 = 3 o'clock, increases clockwise in SVG)
 * @param spanDeg   How many degrees to sweep (clamped to 359.99 max)
 */
export function arcPath(
  cx: number, cy: number, r: number,
  startDeg: number, spanDeg: number,
): string {
  if (spanDeg <= 0) return ''
  const span = Math.min(spanDeg, 359.99)
  const sx = cx + r * Math.cos(startDeg * DEG)
  const sy = cy + r * Math.sin(startDeg * DEG)
  const ex = cx + r * Math.cos((startDeg + span) * DEG)
  const ey = cy + r * Math.sin((startDeg + span) * DEG)
  const large = span > 180 ? 1 : 0
  return `M ${fmt(sx)} ${fmt(sy)} A ${r} ${r} 0 ${large} 1 ${fmt(ex)} ${fmt(ey)}`
}
