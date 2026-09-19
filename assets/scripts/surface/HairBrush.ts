import type { SurfaceHairSimulation } from './SurfaceHairSimulation';
import type { HairProjection } from '../hair/HairScreenCutter';
import { closest, inside } from './ScreenStroke';
import { unposeRay } from './HeadPose';
const ZERO = [0, 0, 0];
/** 用当前保留发体拾取。梳理锁定起手发束；风场只在按住期间低频采样。 */
export class HairBrush {
    private screen = new Float64Array(0);
    private weights = new Float64Array(0);
    private sums = new Float64Array(0);
    private counts = new Float64Array(0);
    private captured = false;
    private alive = new Uint8Array(0);
    private readonly q = { x: 0, y: 0, depth: 0 };
    private readonly pair = { a: 0, b: 0, distance: 0 };
    private readonly a = { ox: 0, oy: 0, oz: 0, dx: 0, dy: 0, dz: 0 };
    private readonly b = { ...this.a };
    private readonly local = { ...this.a };
    private readonly delta = { x: 0, y: 0, z: 0 };
    end(): void { this.captured = false; this.weights.fill(0); }
    private pick(sim: SurfaceHairSimulation, projection: HairProjection, x0: number, y0: number, x1: number, y1: number, radius: number): boolean {
        if (sim.paused || sim.debugScalp || ![x0, y0, x1, y1, radius].every(Number.isFinite) || radius <= 0)
            return false;
        const mesh = sim.cutMesh || sim.fiberMesh, p = mesh.evaluate(sim), ix = mesh.indices;
        if (this.screen.length !== p.length)
            this.screen = new Float64Array(p.length);
        if (this.weights.length !== sim.fiberRig.fibers.length)
            this.weights = new Float64Array(sim.fiberRig.fibers.length);
        this.weights.fill(0);
        if (this.alive.length !== this.weights.length)
            this.alive = new Uint8Array(this.weights.length);
        this.alive.fill(0);
        for (let group = 0; group < this.alive.length; group++)
            for (const id of sim.fiberRig.fibers[group].ids)
                if (sim.lengths[id] > 0) {
                    this.alive[group] = 1;
                    break;
                }
        const s = this.screen;
        for (let i = 0; i < p.length; i += 3) {
            projection.project(p[i], p[i + 1], p[i + 2], this.q);
            s[i] = this.q.x;
            s[i + 1] = this.q.y;
            s[i + 2] = this.q.depth;
        }
        let hit = false;
        for (let f = 0; f < ix.length; f += 3) {
            const group = mesh.groups[f / 3];
            if (this.weights[group] > .999 || !this.alive[group])
                continue;
            const a = ix[f] * 3, b = ix[f + 1] * 3, c = ix[f + 2] * 3;
            if (s[a + 2] <= 0 || s[b + 2] <= 0 || s[c + 2] <= 0)
                continue;
            if (Math.max(s[a], s[b], s[c]) < Math.min(x0, x1) - radius || Math.min(s[a], s[b], s[c]) > Math.max(x0, x1) + radius || Math.max(s[a + 1], s[b + 1], s[c + 1]) < Math.min(y0, y1) - radius || Math.min(s[a + 1], s[b + 1], s[c + 1]) > Math.max(y0, y1) + radius)
                continue;
            let distance = Infinity, hx = 0, hy = 0;
            for (let j = 0; j < 3; j++) {
                const u = ix[f + j] * 3, v = ix[f + (j + 1) % 3] * 3;
                closest(x0, y0, x1, y1, s[u], s[u + 1], s[v], s[v + 1], this.pair);
                if (this.pair.distance < distance) {
                    distance = this.pair.distance;
                    hx = s[u] + (s[v] - s[u]) * this.pair.b;
                    hy = s[u + 1] + (s[v + 1] - s[u + 1]) * this.pair.b;
                }
            }
            if (inside(x0, y0, s[a], s[a + 1], s[b], s[b + 1], s[c], s[c + 1])) {
                hx = x0;
                hy = y0;
                distance = 0;
            }
            else if (inside(x1, y1, s[a], s[a + 1], s[b], s[b + 1], s[c], s[c + 1])) {
                hx = x1;
                hy = y1;
                distance = 0;
            }
            if (distance > radius * radius)
                continue;
            const det = (s[b + 1] - s[c + 1]) * (s[a] - s[c]) + (s[c] - s[b]) * (s[a + 1] - s[c + 1]);
            if (Math.abs(det) < 1e-9)
                continue;
            let wa = ((s[b + 1] - s[c + 1]) * (hx - s[c]) + (s[c] - s[b]) * (hy - s[c + 1])) / det, wb = ((s[c + 1] - s[a + 1]) * (hx - s[c]) + (s[a] - s[c]) * (hy - s[c + 1])) / det, wc = 1 - wa - wb;
            wa /= s[a + 2];
            wb /= s[b + 2];
            wc /= s[c + 2];
            const sum = wa + wb + wc;
            wa /= sum;
            wb /= sum;
            wc /= sum;
            const px = p[a] * wa + p[b] * wb + p[c] * wc, py = p[a + 1] * wa + p[b + 1] * wb + p[c + 1] * wc, pz = p[a + 2] * wa + p[b + 2] * wb + p[c + 2] * wc;
            projection.rayAt(hx, hy, this.a);
            const ray = this.a, depth = (px - ray.ox) * ray.dx + (py - ray.oy) * ray.dy + (pz - ray.oz) * ray.dz;
            if (depth >= sim.occluder.distance(ray, sim.yaw, sim.pitch) - 1e-5)
                continue;
            this.weights[group] = Math.max(this.weights[group], 1 - Math.sqrt(distance) / radius);
            hit = true;
        }
        return hit;
    }
    comb(sim: SurfaceHairSimulation, projection: HairProjection, x0: number, y0: number, x1: number, y1: number, radius: number, scale: number): number {
        const travel = Math.hypot(x1 - x0, y1 - y0) / scale;
        if (sim.paused || sim.debugScalp || !Number.isFinite(travel) || travel < .1)
            return 0;
        if (!this.captured)
            this.captured = this.pick(sim, projection, x0, y0, x1, y1, radius);
        if (!this.captured)
            return 0;
        projection.rayAt(x0, y0, this.a);
        projection.rayAt(x1, y1, this.b);
        // 当前相机固定朝 -Z，射线的相机平面差值天然兼容两种屏幕纵轴。
        this.a.dx = this.b.dx / (-this.b.dz) - this.a.dx / (-this.a.dz);
        this.a.dy = this.b.dy / (-this.b.dz) - this.a.dy / (-this.a.dz);
        this.a.dz = 0;
        unposeRay(this.a, sim.yaw, sim.pitch, ZERO, this.local);
        let changed = 0;
        for (let group = 0; group < this.weights.length; group++) {
            const weight = this.weights[group];
            if (weight <= 0)
                continue;
            const fiber = sim.fiberRig.fibers[group];
            if (!fiber.ids.some(id => sim.lengths[id] > 0))
                continue;
            sim.fiberRig.comb(group, this.local.dx, this.local.dy, this.local.dz, 1 - Math.exp(-travel * weight / 120), sim, this.delta);
            changed++;
        }
        if (changed)
            this.syncTargets(sim);
        return changed;
    }
    private syncTargets(sim: SurfaceHairSimulation): void {
        if (this.counts.length !== sim.lengths.length) {
            this.counts = new Float64Array(sim.lengths.length);
            this.sums = new Float64Array(sim.lengths.length * 3);
        }
        this.counts.fill(0);
        this.sums.fill(0);
        for (const fiber of sim.fiberRig.fibers)
            for (const id of fiber.ids) {
                this.counts[id]++;
                for (let a = 0; a < 3; a++)
                    this.sums[id * 3 + a] += fiber.end[a] - fiber.baseEnd[a];
            }
        sim.setGroomTargets(this.sums, this.counts);
        sim.revision++;
    }
    blow(sim: SurfaceHairSimulation, projection: HairProjection, x: number, y: number, dx: number, dy: number, radius: number, dt: number): number {
        if (!Number.isFinite(dt) || dt <= 0 || !Number.isFinite(dx) || !Number.isFinite(dy) || Math.hypot(dx, dy) < 1e-8 || !this.pick(sim, projection, x, y, x, y, radius))
            return 0;
        projection.rayAt(x, y, this.a);
        projection.rayAt(x + dx, y + dy, this.b);
        let vx = this.b.dx / (-this.b.dz) - this.a.dx / (-this.a.dz), vy = this.b.dy / (-this.b.dz) - this.a.dy / (-this.a.dz), n = Math.hypot(vx, vy) || 1;
        vx /= n;
        vy /= n;
        this.a.dx = vx;
        this.a.dy = vy;
        this.a.dz = 0;
        unposeRay(this.a, sim.yaw, sim.pitch, ZERO, this.local);
        const step = Math.min(dt, .1);
        let count = 0;
        for (let group = 0; group < this.weights.length; group++)
            if (this.weights[group] > 0) {
                const weight = this.weights[group];
                sim.fiberRig.comb(group, this.local.dx, this.local.dy, this.local.dz, 1 - Math.exp(-step * weight * 1.4), sim, this.delta);
                sim.fiberRig.blow(group, vx, vy, 0, step * weight);
                count++;
            }
        if (count)
            this.syncTargets(sim);
        return count;
    }
}
