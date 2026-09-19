export interface Pair {
    a: number;
    b: number;
    distance: number;
}
const clamp = (v: number) => Math.max(0, Math.min(1, v));
function endpoint(px: number, py: number, ax: number, ay: number, bx: number, by: number, fixed: number, swap: boolean, out: Pair): void {
    const dx = bx - ax, dy = by - ay, length = dx * dx + dy * dy;
    const t = length > 1e-12 ? clamp(((px - ax) * dx + (py - ay) * dy) / length) : 0;
    const ex = px - ax - dx * t, ey = py - ay - dy * t, distance = ex * ex + ey * ey;
    if (distance < out.distance) {
        out.distance = distance;
        out.a = swap ? t : fixed;
        out.b = swap ? fixed : t;
    }
}
export function closest(ax: number, ay: number, bx: number, by: number, cx: number, cy: number, dx: number, dy: number, out: Pair): void {
    const ux = bx - ax, uy = by - ay, vx = dx - cx, vy = dy - cy;
    const cross = ux * vy - uy * vx;
    if (Math.abs(cross) > 1e-10) {
        const a = ((cx - ax) * vy - (cy - ay) * vx) / cross;
        const b = ((cx - ax) * uy - (cy - ay) * ux) / cross;
        if (a >= 0 && a <= 1 && b >= 0 && b <= 1) {
            out.a = a;
            out.b = b;
            out.distance = 0;
            return;
        }
    }
    out.distance = Infinity;
    endpoint(ax, ay, cx, cy, dx, dy, 0, false, out);
    endpoint(bx, by, cx, cy, dx, dy, 1, false, out);
    endpoint(cx, cy, ax, ay, bx, by, 0, true, out);
    endpoint(dx, dy, ax, ay, bx, by, 1, true, out);
}
export function inside(x: number, y: number, ax: number, ay: number, bx: number, by: number, cx: number, cy: number): boolean {
    const area = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
    if (Math.abs(area) < 1e-8)
        return false;
    const a = (bx - ax) * (y - ay) - (by - ay) * (x - ax);
    const b = (cx - bx) * (y - by) - (cy - by) * (x - bx);
    const c = (ax - cx) * (y - cy) - (ay - cy) * (x - cx);
    return area > 0 ? a >= 0 && b >= 0 && c >= 0 : a <= 0 && b <= 0 && c <= 0;
}
