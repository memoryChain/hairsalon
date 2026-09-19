import { HairProjection } from '../hair/HairScreenCutter';
import { BoundHairMesh, Binding, blend } from './BoundHairMesh';
import { SurfaceHairSimulation } from './SurfaceHairSimulation';
import { addFiberDebris } from './FiberDebris';
import { closest, inside } from './ScreenStroke';
const level = (b: Binding): number => b.levels.reduce((v, t, i) => v + t * b.weights[i], 0);
/** 按当前可见三角形扫掠，沿每缕长度截断；一个手势同缕只剪一次。 */
export class FiberScreenCutter {
    private readonly visited = new Set<number>();
    private screen = new Float64Array(0);
    private levels = new Float64Array(0);
    private readonly q = { x: 0, y: 0, depth: 0 };
    private readonly pair = { a: 0, b: 0, distance: 0 };
    private readonly ray = { ox: 0, oy: 0, oz: 0, dx: 0, dy: 0, dz: 0 };
    begin(): void { this.visited.clear(); }
    end(): void { this.visited.clear(); }
    sweep(sim: SurfaceHairSimulation, projection: HairProjection, x0: number, y0: number, x1: number, y1: number, radius: number): boolean {
        if (sim.paused || sim.debugScalp || ![x0, y0, x1, y1, radius].every(Number.isFinite) || radius <= 0)
            return false;
        const mesh = sim.cutMesh || sim.fiberMesh, p = mesh.evaluate(sim), ix = mesh.indices;
        if (this.screen.length < p.length) {
            this.screen = new Float64Array(p.length);
            this.levels = new Float64Array(p.length / 3);
        }
        for (let i = 0; i < mesh.bindings.length; i++) {
            projection.project(p[i * 3], p[i * 3 + 1], p[i * 3 + 2], this.q);
            this.screen[i * 3] = this.q.x;
            this.screen[i * 3 + 1] = this.q.y;
            this.screen[i * 3 + 2] = this.q.depth;
            this.levels[i] = level(mesh.bindings[i]);
        }
        const targets = new Map<number, number>(), maxima = new Map<number, number>(), s = this.screen;
        for (let f = 0; f < ix.length; f += 3) {
            const group = mesh.groups[f / 3], ids = sim.fiberRig.fibers[group].ids;
            if (this.visited.has(group) || !ids.some(i => sim.lengths[i] > 0))
                continue;
            const a = ix[f] * 3, b = ix[f + 1] * 3, c = ix[f + 2] * 3;
            maxima.set(group, Math.max(maxima.get(group) || 0, this.levels[a / 3], this.levels[b / 3], this.levels[c / 3]));
            if (s[a + 2] <= 0 || s[b + 2] <= 0 || s[c + 2] <= 0)
                continue;
            if (Math.max(s[a], s[b], s[c]) < Math.min(x0, x1) - radius || Math.min(s[a], s[b], s[c]) > Math.max(x0, x1) + radius ||
                Math.max(s[a + 1], s[b + 1], s[c + 1]) < Math.min(y0, y1) - radius || Math.min(s[a + 1], s[b + 1], s[c + 1]) > Math.max(y0, y1) + radius)
                continue;
            // 取刷子与三角形接触处，避免只检测中心线漏掉宽发缕。
            let hx = 0, hy = 0, distance = Infinity;
            for (let edge = 0; edge < 3; edge++) {
                const u = ix[f + edge] * 3, v = ix[f + (edge + 1) % 3] * 3;
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
            if (Math.abs(det) < 1e-10)
                continue;
            let wa = ((s[b + 1] - s[c + 1]) * (hx - s[c]) + (s[c] - s[b]) * (hy - s[c + 1])) / det / s[a + 2];
            let wb = ((s[c + 1] - s[a + 1]) * (hx - s[c]) + (s[a] - s[c]) * (hy - s[c + 1])) / det / s[b + 2];
            let wc = (1 - wa * s[a + 2] - wb * s[b + 2]) / s[c + 2];
            const sum = wa + wb + wc;
            wa /= sum;
            wb /= sum;
            wc /= sum;
            projection.rayAt(hx, hy, this.ray);
            const px = p[a] * wa + p[b] * wb + p[c] * wc, py = p[a + 1] * wa + p[b + 1] * wb + p[c + 1] * wc, pz = p[a + 2] * wa + p[b + 2] * wb + p[c + 2] * wc;
            const depth = (px - this.ray.ox) * this.ray.dx + (py - this.ray.oy) * this.ray.dy + (pz - this.ray.oz) * this.ray.dz;
            if (depth >= sim.occluder.distance(this.ray, sim.yaw, sim.pitch) - 1e-5)
                continue;
            const t = Math.max(.035, this.levels[a / 3] * wa + this.levels[b / 3] * wb + this.levels[c / 3] * wc);
            targets.set(group, Math.min(targets.get(group) || 1, t));
        }
        for (const [group, t] of targets)
            if (t >= (maxima.get(group) || 0) - .008)
                targets.delete(group);
        if (!targets.size)
            return false;
        const cuts = sim.cuts;
        trimFibers(sim, mesh, targets);
        if (sim.cuts === cuts)
            return false;
        for (const group of targets.keys())
            this.visited.add(group);
        return true;
    }
}
/** 对长度参数裁剪当前网格，保留原三角面和交点绑定，不把剩余头发缩成新尖端。 */
function trimFibers(sim: SurfaceHairSimulation, source: BoundHairMesh, targets: Map<number, number>): void {
    // 从固定原始拓扑重建保留侧，避免反复切割已经细分的三角形导致面数增长。
    const remaining = new Map<number, number>(), levels = source.bindings.map(level);
    for (let f = 0; f < source.indices.length; f += 3) {
        const group = source.groups[f / 3];
        remaining.set(group, Math.max(remaining.get(group) || 0, levels[source.indices[f]], levels[source.indices[f + 1]], levels[source.indices[f + 2]]));
    }
    for (const [group, t] of targets)
        remaining.set(group, t);
    for (const [group, t] of remaining)
        if (t >= 1 - 1e-10)
            remaining.delete(group);
    const mesh = clipMesh(sim.fiberMesh, remaining).kept;
    const debris = clipMesh(source, targets).removed;
    // 保留头发和碎发总容量在同一渲染预算内；失败时不提交半次剪切。
    if (mesh.indices.length > 54000 || mesh.bindings.length > 14000)
        return;
    debris.evaluate(sim);
    debris.evaluate(sim, true);
    addFiberDebris(sim, debris.p, debris.previous, debris.indices, debris.groups);
    sim.cutMesh = mesh;
    sim.cuts++;
    sim.revision++;
}
function clipMesh(source: BoundHairMesh, targets: Map<number, number>): {
    kept: BoundHairMesh;
    removed: BoundHairMesh;
} {
    const bindings = source.bindings.slice(), values = bindings.map(level), crossing = new Map<string, number>();
    const kept: number[] = [], removed: number[] = [], caps: boolean[] = [], groups: number[] = [], removedGroups: number[] = [];
    const seams = new Map<number, number[]>();
    const intersection = (a: number, b: number, t: number): number => {
        if (Math.abs(values[a] - t) < 1e-10)
            return a;
        if (Math.abs(values[b] - t) < 1e-10)
            return b;
        const key = a < b ? a + ':' + b : b + ':' + a, cached = crossing.get(key);
        if (cached !== undefined)
            return cached;
        const id = bindings.length;
        bindings.push(blend(bindings[a], bindings[b], (t - values[a]) / (values[b] - values[a])));
        values.push(t);
        crossing.set(key, id);
        return id;
    };
    const polygon = (tri: number[], t: number, keep: boolean): number[] => {
        const out: number[] = [];
        for (let j = 0; j < 3; j++) {
            const a = tri[j], b = tri[(j + 1) % 3], ina = keep ? values[a] <= t : values[a] >= t, inb = keep ? values[b] <= t : values[b] >= t;
            if (ina && out.indexOf(a) < 0)
                out.push(a);
            if (ina !== inb) {
                const id = intersection(a, b, t);
                if (out.indexOf(id) < 0)
                    out.push(id);
            }
        }
        return out;
    };
    const fan = (poly: number[], out: number[], group: number, cap: boolean): void => {
        for (let j = 1; j + 1 < poly.length; j++) {
            out.push(poly[0], poly[j], poly[j + 1]);
            if (out === kept) {
                groups.push(group);
                caps.push(cap);
            }
            else
                removedGroups.push(group);
        }
    };
    for (let f = 0; f < source.indices.length; f += 3) {
        const group = source.groups[f / 3], t = targets.get(group), tri = source.indices.slice(f, f + 3);
        if (t === undefined) {
            fan(tri, kept, group, source.caps[f / 3]);
            continue;
        }
        const k = polygon(tri, t, true), r = polygon(tri, t, false);
        fan(k, kept, group, source.caps[f / 3]);
        fan(r, removed, group, source.caps[f / 3]);
        if (k.length >= 3 && tri.some(i => values[i] < t - 1e-10))
            for (let j = 0; j < k.length; j++) {
                const a = k[j], b = k[(j + 1) % k.length];
                if (Math.abs(values[a] - t) < 1e-10 && Math.abs(values[b] - t) < 1e-10) {
                    if (!seams.has(group))
                        seams.set(group, []);
                    seams.get(group)!.push(a, b);
                }
            }
    }
    for (const [group, edges] of seams) {
        const ids = Array.from(new Set(edges));
        let center = bindings[ids[0]];
        for (let i = 1; i < ids.length; i++)
            center = blend(center, bindings[ids[i]], 1 / (i + 1));
        const at = bindings.length;
        bindings.push(center);
        for (let j = 0; j < edges.length; j += 2) {
            fan([edges[j + 1], edges[j], at], kept, group, true);
            fan([edges[j], edges[j + 1], at], removed, group, true);
        }
    }
    const used = new Map<number, number>(), ix = kept.map(id => { if (!used.has(id))
        used.set(id, used.size); return used.get(id)!; });
    return { kept: new BoundHairMesh(Array.from(used.keys()).map(id => bindings[id]), ix, caps, groups), removed: new BoundHairMesh(bindings, removed, [], removedGroups) };
}
