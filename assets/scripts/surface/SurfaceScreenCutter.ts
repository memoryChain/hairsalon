import { HairProjection, ScreenPoint } from '../hair/HairScreenCutter';
import { Ray } from '../hair/HairSimulation';
import { SurfaceHairSimulation, Point3 } from './SurfaceHairSimulation';
import { closest, inside, Pair } from './ScreenStroke';
export class SurfaceScreenCutter {
    private screen = new Float64Array(0);
    private marked = new Uint8Array(0);
    private next = new Float64Array(0);
    private readonly visited = new Set<number>();
    private readonly point: Point3 = { x: 0, y: 0, z: 0 };
    private readonly screenPoint: ScreenPoint = { x: 0, y: 0, depth: 0 };
    private readonly ray: Ray = { ox: 0, oy: 0, oz: 0, dx: 0, dy: 0, dz: 0 };
    private readonly pair: Pair = { a: 0, b: 0, distance: 0 };
    begin(): void { this.visited.clear(); }
    end(): void { this.visited.clear(); }
    sweep(sim: SurfaceHairSimulation, projection: HairProjection, x0: number, y0: number, x1: number, y1: number, radius = 10, shave = false): number {
        if (sim.paused || sim.debugScalp || ![x0, y0, x1, y1, radius].every(Number.isFinite) || radius < 0)
            return 0;
        const n = sim.topology.count, ix = sim.topology.triangles;
        if (this.next.length !== n) {
            this.next = new Float64Array(n);
            this.marked = new Uint8Array(n);
            this.screen = new Float64Array(n * 3);
        }
        this.next.set(sim.lengths);
        this.marked.fill(0);
        for (let i = 0; i < n; i++) {
            const k = i * 3;
            if (shave) {
                sim.pointAt(i, 0, this.point);
                projection.project(this.point.x, this.point.y, this.point.z, this.screenPoint);
            }
            else
                projection.project(sim.p[k], sim.p[k + 1], sim.p[k + 2], this.screenPoint);
            this.screen[k] = this.screenPoint.x;
            this.screen[k + 1] = this.screenPoint.y;
            this.screen[k + 2] = this.screenPoint.depth;
        }
        if (shave) {
            for (let i = 0; i < n; i++) {
                const k = i * 3;
                if (this.screen[k + 2] <= .01 || sim.lengths[i] === 0)
                    continue;
                closest(x0, y0, x1, y1, this.screen[k], this.screen[k + 1], this.screen[k], this.screen[k + 1], this.pair);
                if (this.pair.distance <= radius * radius)
                    this.marked[i] = 1;
            }
        }
        else {
            for (let f = 0; f < ix.length; f += 3) {
                const a = ix[f], b = ix[f + 1], c = ix[f + 2];
                if (sim.lengths[a] === 0 && sim.lengths[b] === 0 && sim.lengths[c] === 0)
                    continue;
                if (this.hitTriangle(x0, y0, x1, y1, radius, a * 3, b * 3, c * 3))
                    this.marked[a] = this.marked[b] = this.marked[c] = 1;
            }
        }
        for (let i = 0; i < n; i++) {
            if (!this.marked[i] || this.visited.has(i) || sim.lengths[i] === 0)
                continue;
            const k = i * 3;
            if (shave) {
                sim.pointAt(i, 0, this.point);
                if (!this.visible(sim, projection, this.point.x, this.point.y, this.point.z))
                    continue;
            }
            else if (!this.visible(sim, projection, sim.p[k], sim.p[k + 1], sim.p[k + 2]))
                continue;
            let t = 0;
            if (!shave) {
                let best = Infinity;
                sim.pointAt(i, 0, this.point);
                projection.project(this.point.x, this.point.y, this.point.z, this.screenPoint);
                let ax = this.screenPoint.x, ay = this.screenPoint.y, az = this.screenPoint.depth;
                for (let step = 1; step <= 8; step++) {
                    const end = step / 8 * sim.lengths[i];
                    sim.pointAt(i, end, this.point);
                    projection.project(this.point.x, this.point.y, this.point.z, this.screenPoint);
                    const bx = this.screenPoint.x, by = this.screenPoint.y, bz = this.screenPoint.depth;
                    if (az > .01 && bz > .01) {
                        closest(x0, y0, x1, y1, ax, ay, bx, by, this.pair);
                        if (this.pair.distance < best) {
                            const u = this.pair.b, w0 = (1 - u) / az, w1 = u / bz;
                            t = ((step - 1) + w1 / (w0 + w1)) / 8 * sim.lengths[i];
                            best = this.pair.distance;
                        }
                    }
                    ax = bx;
                    ay = by;
                    az = bz;
                }
                t = Math.max(.035, t);
                sim.pointAt(i, t, this.point);
                if (!this.visible(sim, projection, this.point.x, this.point.y, this.point.z))
                    continue;
            }
            if (sim.lengths[i] - t > .01) {
                this.next[i] = t;
                this.visited.add(i);
            }
        }
        return sim.trim(this.next);
    }
    private visible(sim: SurfaceHairSimulation, projection: HairProjection, x: number, y: number, z: number): boolean {
        projection.project(x, y, z, this.screenPoint);
        if (this.screenPoint.depth <= .01)
            return false;
        projection.rayAt(this.screenPoint.x, this.screenPoint.y, this.ray);
        const r = this.ray;
        const d = (x - r.ox) * r.dx + (y - r.oy) * r.dy + (z - r.oz) * r.dz;
        return d <= sim.occluder.distance(r, sim.yaw, sim.pitch) + .012;
    }
    private hitTriangle(x0: number, y0: number, x1: number, y1: number, r: number, a: number, b: number, c: number): boolean {
        const p = this.screen;
        if (p[a + 2] <= .01 || p[b + 2] <= .01 || p[c + 2] <= .01)
            return false;
        if (Math.max(x0, x1) < Math.min(p[a], p[b], p[c]) - r || Math.min(x0, x1) > Math.max(p[a], p[b], p[c]) + r || Math.max(y0, y1) < Math.min(p[a + 1], p[b + 1], p[c + 1]) - r || Math.min(y0, y1) > Math.max(p[a + 1], p[b + 1], p[c + 1]) + r)
            return false;
        if (inside(x0, y0, p[a], p[a + 1], p[b], p[b + 1], p[c], p[c + 1]) || inside(x1, y1, p[a], p[a + 1], p[b], p[b + 1], p[c], p[c + 1]))
            return true;
        for (let edge = 0; edge < 3; edge++) {
            const u = edge === 0 ? a : edge === 1 ? b : c, v = edge === 0 ? b : edge === 1 ? c : a;
            closest(x0, y0, x1, y1, p[u], p[u + 1], p[v], p[v + 1], this.pair);
            if (this.pair.distance <= r * r)
                return true;
        }
        return false;
    }
}
