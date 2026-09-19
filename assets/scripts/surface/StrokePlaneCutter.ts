import { HairProjection } from '../hair/HairScreenCutter';
import { SurfaceHairSimulation } from './SurfaceHairSimulation';
import { PlaneHairCutter } from './PlaneHairCutter';
import { CutPlane } from './BoundHairMesh';
import { closest } from './ScreenStroke';
/** 滑动线段与相机组成真实切面；有限范围拾取、局部根部保护、头模遮挡。 */
export class StrokePlaneCutter {
    private readonly cutter = new PlaneHairCutter();
    private readonly lastCut = new Map<number, {x: number; y: number}>();
    private distances = new Float64Array(0);
    private roots = new Int8Array(0);
    private extent = new Float64Array(0);
    private readonly a = { ox: 0, oy: 0, oz: 0, dx: 0, dy: 0, dz: 0 };
    private readonly b = { ...this.a };
    private readonly ray = { ...this.a };
    private readonly q = { x: 0, y: 0, z: 0 };
    private readonly u = { x: 0, y: 0, depth: 0 };
    private readonly v = { ...this.u };
    private readonly pair = { a: 0, b: 0, distance: 0 };
    private readonly edge = new Float64Array(6);
    begin(): void { this.lastCut.clear(); }
    end(): void { this.lastCut.clear(); }
    sweep(sim: SurfaceHairSimulation, projection: HairProjection, x0: number, y0: number, x1: number, y1: number, radius: number): boolean {
        if (sim.paused || sim.debugScalp || ![x0, y0, x1, y1, radius].every(Number.isFinite) || radius <= 0 || Math.hypot(x1 - x0, y1 - y0) < 1e-4)
            return false;
        projection.rayAt(x0, y0, this.a);
        projection.rayAt(x1, y1, this.b);
        const a = this.a, b = this.b, nx = a.dy * b.dz - a.dz * b.dy, ny = a.dz * b.dx - a.dx * b.dz, nz = a.dx * b.dy - a.dy * b.dx, length = Math.hypot(nx, ny, nz);
        if (length < 1e-10)
            return false;
        const plane: CutPlane = { x: nx / length, y: ny / length, z: nz / length, d: -(nx * a.ox + ny * a.oy + nz * a.oz) / length };
        const source = sim.cutMesh || sim.fiberMesh, p = source.evaluate(sim), ix = source.indices, fibers = sim.fiberRig.fibers;
        if (this.distances.length < source.bindings.length)
            this.distances = new Float64Array(source.bindings.length);
        if (this.roots.length !== fibers.length) {
            this.roots = new Int8Array(fibers.length);
            this.extent = new Float64Array(fibers.length);
        }
        this.roots.fill(0);
        this.extent.fill(0);
        for (let group = 0; group < fibers.length; group++) {
            // 每缕只做短距离防抖；移动到新位置后，同一次触摸也能继续剪。
            const prior = this.lastCut.get(group);
            if (prior && Math.hypot(x1-prior.x,y1-prior.y) < radius * .65)
                continue;
            let min = Infinity, max = -Infinity, living = false;
            for (const id of fibers[group].ids) {
                if (sim.lengths[id] > 0)
                    living = true;
                sim.pointAt(id, 0, this.q);
                const d = plane.x * this.q.x + plane.y * this.q.y + plane.z * this.q.z + plane.d;
                min = Math.min(min, d);
                max = Math.max(max, d);
            }
            // 一条发缕的整个根面必须在保留侧，不限制其他未命中根域。
            if (living)
                this.roots[group] = max < -.008 ? 1 : min > .008 ? -1 : 0;
        }
        for (let i = 0; i < source.bindings.length; i++)
            this.distances[i] = plane.x * p[i * 3] + plane.y * p[i * 3 + 1] + plane.z * p[i * 3 + 2] + plane.d;
        const positive = new Set<number>(), negative = new Set<number>();
        for (let f = 0; f < ix.length; f += 3) {
            const group = source.groups[f / 3], sign = this.roots[group];
            if (!sign)
                continue;
            this.extent[group] = Math.max(this.extent[group], sign * this.distances[ix[f]], sign * this.distances[ix[f + 1]], sign * this.distances[ix[f + 2]]);
            if ((sign === 1 ? positive : negative).has(group))
                continue;
            let count = 0;
            for (let j = 0; j < 3; j++) {
                const ia = ix[f + j], ib = ix[f + (j + 1) % 3], da = this.distances[ia], db = this.distances[ib];
                if (Math.abs(da) < 1e-9) {
                    if (count < 2) {
                        for (let k = 0; k < 3; k++)
                            this.edge[count * 3 + k] = p[ia * 3 + k];
                        count++;
                    }
                }
                else if (da * db < 0 && Math.abs(db) >= 1e-9) {
                    const t = da / (da - db);
                    if (count < 2) {
                        for (let k = 0; k < 3; k++)
                            this.edge[count * 3 + k] = p[ia * 3 + k] + (p[ib * 3 + k] - p[ia * 3 + k]) * t;
                        count++;
                    }
                }
            }
            if (count !== 2)
                continue;
            projection.project(this.edge[0], this.edge[1], this.edge[2], this.u);
            projection.project(this.edge[3], this.edge[4], this.edge[5], this.v);
            if (this.u.depth <= 0 || this.v.depth <= 0)
                continue;
            closest(x0, y0, x1, y1, this.u.x, this.u.y, this.v.x, this.v.y, this.pair);
            if (this.pair.distance > radius * radius)
                continue;
            const t = this.pair.b, depthWeight = t * this.u.depth / (this.v.depth * (1 - t) + this.u.depth * t);
            const px = this.edge[0] + (this.edge[3] - this.edge[0]) * depthWeight, py = this.edge[1] + (this.edge[4] - this.edge[1]) * depthWeight, pz = this.edge[2] + (this.edge[5] - this.edge[2]) * depthWeight;
            projection.rayAt(this.u.x + (this.v.x - this.u.x) * t, this.u.y + (this.v.y - this.u.y) * t, this.ray);
            const ray = this.ray, depth = (px - ray.ox) * ray.dx + (py - ray.oy) * ray.dy + (pz - ray.oz) * ray.dz;
            if (depth >= sim.occluder.distance(ray, sim.yaw, sim.pitch) - 1e-5)
                continue;
            (sign === 1 ? positive : negative).add(group);
        }
        let changed = false;
        for (const [groups, sign] of [[positive, 1], [negative, -1]] as [
            Set<number>,
            number
        ][]) {
            for (const group of groups)
                if (this.extent[group] < 1e-5)
                    groups.delete(group);
            if (!groups.size)
                continue;
            const oriented = { x: plane.x * sign, y: plane.y * sign, z: plane.z * sign, d: plane.d * sign };
            const result = this.cutter.clip(sim, oriented, undefined, groups);
            if (result.changed) {
                changed = true;
                for (const group of result.groups || [])
                    this.lastCut.set(group, {x:x1,y:y1});
            }
        }
        return changed;
    }
}
