import { CONFIG } from '../core/PrototypeConfig';
import { HairSimulation, headRayDistance, Ray } from './HairSimulation';
import { fillStrandRings } from './HairShape';

export interface ScreenPoint { x: number; y: number; depth: number }
export interface HairProjection {
    project(x: number, y: number, z: number, out: ScreenPoint): void;
    rayAt(x: number, y: number, out: Ray): void;
}
interface Pair { a: number; b: number; distance: number }
const clamp = (v: number) => Math.max(0, Math.min(1, v));

function endpoint(px: number, py: number, ax: number, ay: number, bx: number, by: number,
    fixed: number, swap: boolean, out: Pair): void {
    const dx = bx - ax, dy = by - ay, length = dx * dx + dy * dy;
    const t = length > 1e-12 ? clamp(((px - ax) * dx + (py - ay) * dy) / length) : 0;
    const ex = px - ax - dx * t, ey = py - ay - dy * t, distance = ex * ex + ey * ey;
    if (distance < out.distance) { out.distance = distance; out.a = swap ? t : fixed; out.b = swap ? fixed : t; }
}
function closest(ax: number, ay: number, bx: number, by: number,
    cx: number, cy: number, dx: number, dy: number, out: Pair): void {
    const ux = bx - ax, uy = by - ay, vx = dx - cx, vy = dy - cy;
    const cross = ux * vy - uy * vx;
    if (Math.abs(cross) > 1e-10) {
        const a = ((cx - ax) * vy - (cy - ay) * vx) / cross;
        const b = ((cx - ax) * uy - (cy - ay) * ux) / cross;
        if (a >= 0 && a <= 1 && b >= 0 && b <= 1) { out.a = a; out.b = b; out.distance = 0; return; }
    }
    out.distance = Infinity;
    endpoint(ax, ay, cx, cy, dx, dy, 0, false, out);
    endpoint(bx, by, cx, cy, dx, dy, 1, false, out);
    endpoint(cx, cy, ax, ay, bx, by, 0, true, out);
    endpoint(dx, dy, ax, ay, bx, by, 1, true, out);
}
function inside(x: number, y: number, ax: number, ay: number, bx: number, by: number, cx: number, cy: number): boolean {
    const area = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
    if (Math.abs(area) < 1e-8) return false;
    const a = (bx - ax) * (y - ay) - (by - ay) * (x - ax);
    const b = (cx - bx) * (y - by) - (cy - by) * (x - bx);
    const c = (ax - cx) * (y - cy) - (ay - cy) * (x - cx);
    return area > 0 ? a >= 0 && b >= 0 && c >= 0 : a <= 0 && b <= 0 && c <= 0;
}

/** 连续划线与实际截面投影相交；一次手势中每簇只剪一次。 */
export class HairScreenCutter {
    private readonly cutIds = new Set<number>();
    private readonly rings = new Float64Array(16 * CONFIG.radialSides * 3);
    private readonly projected = new Float64Array(16 * CONFIG.radialSides * 3);
    private readonly centers = new Float64Array(16 * 3);
    private readonly point: ScreenPoint = { x: 0, y: 0, depth: 0 };
    private readonly pair: Pair = { a: 0, b: 0, distance: 0 };
    private readonly edge: Pair = { a: 0, b: 0, distance: 0 };
    private readonly ray: Ray = { ox: 0, oy: 0, oz: 0, dx: 0, dy: 0, dz: -1 };
    begin(): void { this.cutIds.clear(); }
    end(): void { this.cutIds.clear(); }

    sweep(sim: HairSimulation, projection: HairProjection, x0: number, y0: number,
        x1: number, y1: number, radius: number = CONFIG.cutRadiusPixels): number {
        if (![x0, y0, x1, y1, radius].every(Number.isFinite) || radius < 0) return 0;
        const sides = CONFIG.radialSides, screen = this.projected, centers = this.centers;
        let cuts = 0;
        for (const strand of sim.strands) {
            if (!strand.attached || this.cutIds.has(strand.id)) continue;
            fillStrandRings(strand, this.rings);
            let totalLength = 0;
            for (let i = 0; i < strand.count; i++) {
                const k = i * 3;
                projection.project(strand.p[k], strand.p[k + 1], strand.p[k + 2], this.point);
                centers[k] = this.point.x; centers[k + 1] = this.point.y; centers[k + 2] = this.point.depth;
                totalLength += strand.lengths[i];
            }
            for (let k = 0; k < strand.count * sides * 3; k += 3) {
                projection.project(this.rings[k], this.rings[k + 1], this.rings[k + 2], this.point);
                screen[k] = this.point.x; screen[k + 1] = this.point.y; screen[k + 2] = this.point.depth;
            }
            let segment = -1, fraction = 0, best = Infinity, prefix = 0;
            for (let i = 1; i < strand.count; i++) {
                const a = (i - 1) * 3, b = i * 3, length = strand.lengths[i];
                const before = prefix; prefix += length;
                if (centers[a + 2] <= 0.01 || centers[b + 2] <= 0.01) continue;
                let hit = false;
                for (let j = 0; j < sides && !hit; j++) {
                    const ra = ((i - 1) * sides + j) * 3, rb = ((i - 1) * sides + (j + 1) % sides) * 3;
                    const rc = (i * sides + j) * 3, rd = (i * sides + (j + 1) % sides) * 3;
                    hit = this.triangle(x0, y0, x1, y1, radius, ra, rb, rc)
                        || this.triangle(x0, y0, x1, y1, radius, rb, rd, rc);
                }
                if (!hit) continue;
                closest(x0, y0, x1, y1, centers[a], centers[a + 1], centers[b], centers[b + 1], this.pair);
                const u = this.pair.b;
                // 屏幕插值需按深度还原，斜向镜头的长发才能在划线处剪断。
                const weightA = (1 - u) / centers[a + 2], weightB = u / centers[b + 2];
                const t = Math.max(0.0001, Math.min(0.9999, weightB / (weightA + weightB)));
                const kept = before + length * t;
                if (kept < CONFIG.minCutLength || totalLength - kept < CONFIG.minCutLength) continue;
                const x = strand.p[a] + (strand.p[b] - strand.p[a]) * t;
                const y = strand.p[a + 1] + (strand.p[b + 1] - strand.p[a + 1]) * t;
                const z = strand.p[a + 2] + (strand.p[b + 2] - strand.p[a + 2]) * t;
                projection.project(x, y, z, this.point); projection.rayAt(this.point.x, this.point.y, this.ray);
                const ray = this.ray;
                const distance = (x - ray.ox) * ray.dx + (y - ray.oy) * ray.dy + (z - ray.oz) * ray.dz;
                const thickness = strand.radius[i - 1] + (strand.radius[i] - strand.radius[i - 1]) * t;
                if (distance - thickness >= headRayDistance(ray, sim.yaw) - 0.002) continue;
                const score = this.pair.distance;
                if (score < best) { segment = i; fraction = t; best = score; }
            }
            if (segment !== -1 && sim.cut(strand, segment, fraction)) {
                this.cutIds.add(strand.id); cuts++;
            }
        }
        return cuts;
    }
    private triangle(x0: number, y0: number, x1: number, y1: number, radius: number, a: number, b: number, c: number): boolean {
        const p = this.projected;
        if (p[a + 2] <= 0.01 || p[b + 2] <= 0.01 || p[c + 2] <= 0.01) return false;
        const minX = Math.min(p[a], p[b], p[c]) - radius, maxX = Math.max(p[a], p[b], p[c]) + radius;
        const minY = Math.min(p[a + 1], p[b + 1], p[c + 1]) - radius, maxY = Math.max(p[a + 1], p[b + 1], p[c + 1]) + radius;
        if (Math.max(x0, x1) < minX || Math.min(x0, x1) > maxX || Math.max(y0, y1) < minY || Math.min(y0, y1) > maxY) return false;
        if (inside(x0, y0, p[a], p[a + 1], p[b], p[b + 1], p[c], p[c + 1])
            || inside(x1, y1, p[a], p[a + 1], p[b], p[b + 1], p[c], p[c + 1])) return true;
        const r2 = radius * radius;
        closest(x0, y0, x1, y1, p[a], p[a + 1], p[b], p[b + 1], this.edge);
        if (this.edge.distance <= r2) return true;
        closest(x0, y0, x1, y1, p[b], p[b + 1], p[c], p[c + 1], this.edge);
        if (this.edge.distance <= r2) return true;
        closest(x0, y0, x1, y1, p[c], p[c + 1], p[a], p[a + 1], this.edge);
        return this.edge.distance <= r2;
    }
}
