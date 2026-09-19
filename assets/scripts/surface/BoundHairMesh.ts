import type { SurfaceHairSimulation, Point3 } from './SurfaceHairSimulation';
import { Ray } from '../hair/HairSimulation';
export interface Binding {
    samples?: number[];
    sampleWeights?: number[];
    guides: number[];
    levels: number[];
    weights: number[];
}
export interface CutPlane {
    x: number;
    y: number;
    z: number;
    d: number;
}
/** 刀口交点持久绑定到原导向场，后续摆动不重建或恢复被删除的面。 */
export class BoundHairMesh {
    readonly p: Float64Array;
    readonly previous: Float64Array;
    private readonly levels: number[] = [];
    private readonly offsets: Int32Array[] = [];
    private stride = 0;
    private cache = new Float64Array(0);
    private readonly point: Point3 = { x: 0, y: 0, z: 0 };
    constructor(readonly bindings: Binding[], readonly indices: number[], readonly caps: boolean[], readonly groups: number[] = []) {
        this.p = new Float64Array(bindings.length * 3);
        this.previous = new Float64Array(this.p.length);
        if (bindings.length && bindings[0].samples)
            return;
        for (const b of bindings)
            for (let j = 0; j < b.guides.length; j++) {
                this.stride = Math.max(this.stride, b.guides[j] + 1);
                if (this.levels.indexOf(b.levels[j]) < 0)
                    this.levels.push(b.levels[j]);
            }
        this.cache = new Float64Array(this.stride * this.levels.length * 3);
        for (const b of bindings)
            this.offsets.push(Int32Array.from(b.guides.map((guide, j) => (this.levels.indexOf(b.levels[j]) * this.stride + guide) * 3)));
    }
    static from(sim: SurfaceHairSimulation): BoundHairMesh {
        if (sim.fiberMesh)
            return sim.fiberMesh;
        const bindings: Binding[] = [], indices: number[] = [], caps: boolean[] = [], map = new Map<string, number>();
        const vertex = (guide: number, level: number) => {
            if (sim.lengths[guide] === 0)
                level = 0;
            const key = guide + ':' + level;
            let id = map.get(key);
            if (id === undefined) {
                id = bindings.length;
                map.set(key, id);
                bindings.push({ guides: [guide], levels: [level], weights: [1] });
            }
            return id;
        };
        const tri = (a: number, b: number, c: number) => {
            if (a !== b && b !== c && a !== c) {
                indices.push(a, b, c);
                caps.push(false);
            }
        };
        const ix = sim.topology.triangles;
        for (let f = 0; f < ix.length; f += 3) {
            const a = ix[f], b = ix[f + 1], c = ix[f + 2];
            if (sim.lengths[a] === 0 && sim.lengths[b] === 0 && sim.lengths[c] === 0)
                continue;
            tri(vertex(a, 1), vertex(b, 1), vertex(c, 1));
            tri(vertex(c, 0), vertex(b, 0), vertex(a, 0));
        }
        for (const e of sim.topology.edges)
            if (e.faces.length === 1)
                for (let row = 0; row < 4; row++) {
                    const l = row / 4, h = (row + 1) / 4;
                    tri(vertex(e.a, l), vertex(e.b, l), vertex(e.a, h));
                    tri(vertex(e.b, l), vertex(e.b, h), vertex(e.a, h));
                }
        return new BoundHairMesh(bindings, indices, caps);
    }
    evaluate(sim: SurfaceHairSimulation, previous = false): Float64Array {
        const p = previous ? this.previous : this.p, q = this.point;
        if (this.bindings.length && this.bindings[0].samples) {
            const samples = sim.fiberRig.evaluate(sim, previous);
            for (let i = 0; i < this.bindings.length; i++) {
                const b = this.bindings[i];
                let x = 0, y = 0, z = 0;
                for (let j = 0; j < b.samples!.length; j++) {
                    const at = b.samples![j] * 3, w = b.sampleWeights![j];
                    x += samples[at] * w;
                    y += samples[at + 1] * w;
                    z += samples[at + 2] * w;
                }
                p[i * 3] = x;
                p[i * 3 + 1] = y;
                p[i * 3 + 2] = z;
            }
            return p;
        }
        for (let level = 0; level < this.levels.length; level++)
            for (let guide = 0; guide < this.stride; guide++) {
                sim.pointAt(guide, this.levels[level] * sim.lengths[guide], q, previous);
                const k = (level * this.stride + guide) * 3;
                this.cache[k] = q.x;
                this.cache[k + 1] = q.y;
                this.cache[k + 2] = q.z;
            }
        for (let i = 0; i < this.bindings.length; i++) {
            const b = this.bindings[i];
            let x = 0, y = 0, z = 0;
            for (let j = 0; j < b.guides.length; j++) {
                const k = this.offsets[i][j], w = b.weights[j];
                x += this.cache[k] * w;
                y += this.cache[k + 1] * w;
                z += this.cache[k + 2] * w;
            }
            p[i * 3] = x;
            p[i * 3 + 1] = y;
            p[i * 3 + 2] = z;
        }
        return p;
    }
    snapshot(sim: SurfaceHairSimulation): {
        p: Float64Array;
        previous: Float64Array;
    } {
        return { p: this.evaluate(sim).slice(), previous: this.evaluate(sim, true).slice() };
    }
    distance(ray: Ray, sim?: SurfaceHairSimulation): number {
        let best = Infinity;
        for (let f = 0; f < this.indices.length; f += 3) {
            if (sim) {
                let living = false;
                for (let j = 0; j < 3; j++)
                    for (const id of this.bindings[this.indices[f + j]].guides)
                        if (sim.lengths[id] > 0)
                            living = true;
                if (!living)
                    continue;
            }
            best = Math.min(best, triangleDistance(this.p, this.indices[f] * 3, this.indices[f + 1] * 3, this.indices[f + 2] * 3, ray));
        }
        return best;
    }
}
export function triangleDistance(p: ArrayLike<number>, a: number, b: number, c: number, r: Ray): number {
    const ux = p[b] - p[a], uy = p[b + 1] - p[a + 1], uz = p[b + 2] - p[a + 2], vx = p[c] - p[a], vy = p[c + 1] - p[a + 1], vz = p[c + 2] - p[a + 2];
    const hx = r.dy * vz - r.dz * vy, hy = r.dz * vx - r.dx * vz, hz = r.dx * vy - r.dy * vx, det = ux * hx + uy * hy + uz * hz;
    if (Math.abs(det) < 1e-12)
        return Infinity;
    const tx = r.ox - p[a], ty = r.oy - p[a + 1], tz = r.oz - p[a + 2], u = (tx * hx + ty * hy + tz * hz) / det;
    if (u < 0 || u > 1)
        return Infinity;
    const qx = ty * uz - tz * uy, qy = tz * ux - tx * uz, qz = tx * uy - ty * ux, v = (r.dx * qx + r.dy * qy + r.dz * qz) / det;
    if (v < 0 || u + v > 1)
        return Infinity;
    const t = (vx * qx + vy * qy + vz * qz) / det;
    return t > 1e-7 ? t : Infinity;
}
export function blend(a: Binding, b: Binding, t: number): Binding {
    const guides: number[] = [], levels: number[] = [], weights: number[] = [], map = new Map<string, number>();
    for (const [binding, factor] of [[a, 1 - t], [b, t]] as [
        Binding,
        number
    ][])
        for (let i = 0; i < binding.guides.length; i++) {
            const key = binding.guides[i] + ':' + binding.levels[i], at = map.get(key), w = binding.weights[i] * factor;
            if (at === undefined) {
                map.set(key, guides.length);
                guides.push(binding.guides[i]);
                levels.push(binding.levels[i]);
                weights.push(w);
            }
            else
                weights[at] += w;
        }
    const result: Binding = { guides, levels, weights };
    if (a.samples && b.samples) {
        const samples: number[] = [], sampleWeights: number[] = [], lookup = new Map<number, number>();
        for (const [binding, factor] of [[a, 1 - t], [b, t]] as [
            Binding,
            number
        ][])
            for (let i = 0; i < binding.samples!.length; i++) {
                const id = binding.samples![i], at = lookup.get(id), w = binding.sampleWeights![i] * factor;
                if (at === undefined) {
                    lookup.set(id, samples.length);
                    samples.push(id);
                    sampleWeights.push(w);
                }
                else
                    sampleWeights[at] += w;
            }
        result.samples = samples;
        result.sampleWeights = sampleWeights;
    }
    return result;
}
