import { selectHairGroups } from './HairMeshGroups';
import { addFiberDebris } from './FiberDebris';
import { BoundHairMesh, CutPlane, blend } from './BoundHairMesh';
import { SurfaceHairSimulation } from './SurfaceHairSimulation';
import { HairProjection } from '../hair/HairScreenCutter';
import { Ray } from '../hair/HairSimulation';
import { closest } from './ScreenStroke';
export interface PlaneCutResult {
    discardedVolume?: number;
    groups?: number[];
    changed: boolean;
    message: string;
}
const LIMIT = 54000;
/** 输入事件时裁剪；共享边交点缓存，逐闭环耳切封口，失败时原子回滚。 */
export class PlaneHairCutter {
    cutStroke(sim: SurfaceHairSimulation, projection: HairProjection, x0: number, y0: number, x1: number, y1: number): PlaneCutResult {
        if (sim.paused || sim.debugScalp || ![x0, y0, x1, y1].every(Number.isFinite) || Math.hypot(x1 - x0, y1 - y0) < 8)
            return { changed: false, message: '拉出至少八像素的刀线再松手' };
        const a: Ray = { ox: 0, oy: 0, oz: 0, dx: 0, dy: 0, dz: 0 }, b = { ...a };
        projection.rayAt(x0, y0, a);
        projection.rayAt(x1, y1, b);
        const x = a.dy * b.dz - a.dz * b.dy, y = a.dz * b.dx - a.dx * b.dz, z = a.dx * b.dy - a.dy * b.dx, n = Math.hypot(x, y, z);
        if (n < 1e-10)
            return { changed: false, message: '刀线太短' };
        const plane = { x: x / n, y: y / n, z: z / n, d: -(x * a.ox + y * a.oy + z * a.oz) / n };
        const center = sim.topology.asset.center;
        if (plane.x * center[0] + plane.y * center[1] + plane.z * center[2] + plane.d > 0) {
            plane.x *= -1;
            plane.y *= -1;
            plane.z *= -1;
            plane.d *= -1;
        }
        const point = { x: 0, y: 0, z: 0 };
        for (let i = 0; i < sim.topology.count; i++) {
            sim.pointAt(i, 0, point);
            if (plane.x * point.x + plane.y * point.y + plane.z * point.z + plane.d > -.008)
                return { changed: false, message: '刀线靠近头皮，请移到外侧发梢；贴头皮修剪可用剃刀' };
        }
        const screenA = { x: 0, y: 0, depth: 0 }, screenB = { ...screenA }, pair = { a: 0, b: 0, distance: 0 };
        return this.clip(sim, plane, (p, u, v) => {
            projection.project(p[u * 3], p[u * 3 + 1], p[u * 3 + 2], screenA);
            projection.project(p[v * 3], p[v * 3 + 1], p[v * 3 + 2], screenB);
            if (screenA.depth <= 0 || screenB.depth <= 0)
                return false;
            closest(x0, y0, x1, y1, screenA.x, screenA.y, screenB.x, screenB.y, pair);
            return pair.distance <= 16;
        });
    }
    clip(sim: SurfaceHairSimulation, plane: CutPlane, touched?: (p: number[], a: number, b: number) => boolean, activeGroups?: ReadonlySet<number>): PlaneCutResult {
        if (sim.paused || sim.debugScalp || ![plane.x, plane.y, plane.z, plane.d].every(Number.isFinite))
            return { changed: false, message: '当前不能剪切' };
        const fullSource = sim.cutMesh || BoundHairMesh.from(sim);
        const source = activeGroups ? selectHairGroups(fullSource, activeGroups) : fullSource;
        source.evaluate(sim);
        const bindings = source.bindings.slice(), p = Array.from(source.p), dist: number[] = [], crossings = new Map<string, number>();
        for (let i = 0; i < bindings.length; i++)
            dist.push(plane.x * p[i * 3] + plane.y * p[i * 3 + 1] + plane.z * p[i * 3 + 2] + plane.d);
        const intersection = (a: number, b: number) => {
            if (Math.abs(dist[a]) < 1e-10)
                return a;
            if (Math.abs(dist[b]) < 1e-10)
                return b;
            const key = a < b ? a + ':' + b : b + ':' + a, cached = crossings.get(key);
            if (cached !== undefined)
                return cached;
            const t = dist[a] / (dist[a] - dist[b]), id = bindings.length;
            bindings.push(blend(bindings[a], bindings[b], t));
            for (let k = 0; k < 3; k++)
                p.push(p[a * 3 + k] * (1 - t) + p[b * 3 + k] * t);
            dist.push(0);
            crossings.set(key, id);
            return id;
        };
        const polygon = (tri: number[], keep: boolean) => {
            const out: number[] = [];
            for (let i = 0; i < 3; i++) {
                const a = tri[i], b = tri[(i + 1) % 3], ina = keep ? dist[a] <= 0 : dist[a] >= 0, inb = keep ? dist[b] <= 0 : dist[b] >= 0;
                if (ina)
                    out.push(a);
                if (ina !== inb)
                    out.push(intersection(a, b));
            }
            return out.filter((id, i) => out.indexOf(id) === i);
        };
        const kept: number[][] = [], removed: number[][] = [], seams: [
            number,
            number
        ][] = [], seamFace: number[] = [];
        for (let f = 0; f < source.indices.length; f += 3) {
            const tri = source.indices.slice(f, f + 3), k = polygon(tri, true), r = polygon(tri, false);
            kept.push(k);
            removed.push(r);
            if (tri.some(i => dist[i] > 1e-9) && tri.some(i => dist[i] < -1e-9)) {
                const edge = k.filter(i => Math.abs(dist[i]) < 1e-9);
                if (edge.length === 2) {
                    seams.push([edge[0], edge[1]]);
                    seamFace.push(f / 3);
                }
            }
        }
        if (!seams.length)
            return { changed: false, message: '刀线没有穿过可剪发梢' };
        const parents = bindings.map((_, i) => i), find = (id: number): number => {
            while (parents[id] !== id) {
                parents[id] = parents[parents[id]];
                id = parents[id];
            }
            return id;
        };
        for (const poly of removed)
            if (poly.length >= 3)
                for (let j = 1; j < poly.length; j++)
                    parents[find(poly[j])] = find(poly[0]);
        const selected = new Set<number>();
        for (let i = 0; i < seams.length; i++) {
            const [a, b] = seams[i];
            if (!touched || touched(p, a, b))
                selected.add(find(removed[seamFace[i]][0]));
        }
        if (!selected.size)
            return { changed: false, message: '请划过想剪掉的发梢' };
        const adjacency = new Map<number, number[]>();
        for (let i = 0; i < seams.length; i++)
            if (selected.has(find(removed[seamFace[i]][0]))) {
                const [a, b] = seams[i];
                for (const [u, v] of [[a, b], [b, a]]) {
                    if (!adjacency.has(u))
                        adjacency.set(u, []);
                    adjacency.get(u)!.push(v);
                }
            }
        for (const neighbors of adjacency.values())
            if (neighbors.length !== 2)
                return { changed: false, message: '刀线恰好经过网格接点，请稍微移动后重试' };
        const visited = new Set<number>(), loops: number[][] = [];
        for (const start of adjacency.keys())
            if (!visited.has(start)) {
                const loop: number[] = [];
                let current = start, prior = -1;
                do {
                    if (visited.has(current))
                        return { changed: false, message: '切口连接异常，本次未改变头发' };
                    visited.add(current);
                    loop.push(current);
                    const list = adjacency.get(current)!;
                    const next = list[0] === prior ? list[1] : list[0];
                    prior = current;
                    current = next;
                } while (current !== start);
                loops.push(loop);
            }
        const indices: number[] = [], caps: boolean[] = [], detached: number[] = [], groups: number[] = [], detachedGroups: number[] = [];
        const vertexGroups = new Map<number, number>();
        for (let f = 0; f < seams.length; f++)
            for (const id of seams[f])
                vertexGroups.set(id, source.groups[seamFace[f]] || 0);
        const fan = (poly: number[], out: number[], cap = false, group = 0) => {
            for (let i = 1; i + 1 < poly.length; i++) {
                out.push(poly[0], poly[i], poly[i + 1]);
                if (out === indices) {
                    caps.push(cap);
                    groups.push(group);
                }
                else
                    detachedGroups.push(group);
            }
        };
        for (let f = 0; f < kept.length; f++) {
            if (removed[f].length >= 3 && selected.has(find(removed[f][0]))) {
                fan(kept[f], indices, source.caps[f], source.groups[f]);
                fan(removed[f], detached, false, source.groups[f]);
            }
            else
                fan(source.indices.slice(f * 3, f * 3 + 3), indices, source.caps[f], source.groups[f]);
        }
        for (const loop of loops) {
            const triangles = triangulate(loop, p, plane);
            if (!triangles)
                return { changed: false, message: '切口无法可靠封闭，本次未改变头发' };
            const edgeDirection = (faces: number[], a: number, b: number): number => {
                for (let f = 0; f < faces.length; f += 3)
                    for (let j = 0; j < 3; j++) {
                        const u = faces[f + j], v = faces[f + (j + 1) % 3];
                        if (u === a && v === b) return 1;
                        if (u === b && v === a) return -1;
                    }
                return 0;
            };
            const direction = edgeDirection(indices, loop[0], loop[1]);
            if (direction && direction === edgeDirection(triangles, loop[0], loop[1]))
                for (let f = 0; f < triangles.length; f += 3) {
                    const swap = triangles[f]; triangles[f] = triangles[f + 2]; triangles[f + 2] = swap;
                }
            for (let f = 0; f < triangles.length; f += 3) {
                indices.push(triangles[f], triangles[f + 1], triangles[f + 2]);
                caps.push(true);
                groups.push(vertexGroups.get(loop[0]) || 0);
                detachedGroups.push(vertexGroups.get(loop[0]) || 0);
                detached.push(triangles[f + 2], triangles[f + 1], triangles[f]);
            }
        }
        if (indices.length > LIMIT || bindings.length > 14000 || !closed(indices) || !closed(detached))
            return { changed: false, message: '本次切口超出原型预算或未闭合，请调整刀线' };
        const used = new Map<number, number>(), compact = indices.map(i => {
            if (!used.has(i))
                used.set(i, used.size);
            return used.get(i)!;
        }), mesh = new BoundHairMesh(Array.from(used.keys()).map(i => bindings[i]), compact, caps, groups);
        const resultMesh = activeGroups ? selectHairGroups(fullSource, activeGroups, mesh) : mesh;
        if (resultMesh.indices.length > LIMIT || resultMesh.bindings.length > 14000)
            return { changed: false, message: '剪切网格达到预算，请恢复发型后继续' };
        const all = new BoundHairMesh(bindings, detached, []);
        all.evaluate(sim);
        all.evaluate(sim, true);
        const discardedVolume = addFiberDebris(sim, all.p, all.previous, detached, detachedGroups);
        sim.cutMesh = resultMesh;
        sim.cuts++;
        sim.revision++;
        return { changed: true, discardedVolume, groups: Array.from(new Set(detachedGroups)), message: '已沿刀线斜切，切口随头发继续摆动' };
    }
}
function closed(indices: number[]): boolean {
    const edges = new Map<string, number>();
    for (let f = 0; f < indices.length; f += 3)
        for (let j = 0; j < 3; j++) {
            const a = indices[f + j], b = indices[f + (j + 1) % 3];
            if (a === b)
                return false;
            const k = a < b ? a + ':' + b : b + ':' + a;
            edges.set(k, (edges.get(k) || 0) + 1);
        }
    return Array.from(edges.values()).every(n => n === 2);
}
/** 耳切保留边界上共线交点，避免封口与侧面之间出现 T 形接缝。 */
function triangulate(loop: number[], p: number[], plane: CutPlane): number[] | null {
    const axis = Math.abs(plane.x) > Math.abs(plane.y) ? (Math.abs(plane.x) > Math.abs(plane.z) ? 0 : 2) : (Math.abs(plane.y) > Math.abs(plane.z) ? 1 : 2), u = (axis + 1) % 3, v = (axis + 2) % 3;
    const cross = (a: number, b: number, c: number) => (p[b * 3 + u] - p[a * 3 + u]) * (p[c * 3 + v] - p[a * 3 + v]) - (p[b * 3 + v] - p[a * 3 + v]) * (p[c * 3 + u] - p[a * 3 + u]);
    const normal = axis === 0 ? plane.x : axis === 1 ? plane.y : plane.z, ids = loop.slice();
    let area = 0;
    for (let j = 0; j < ids.length; j++) {
        const a = ids[j], b = ids[(j + 1) % ids.length];
        area += p[a * 3 + u] * p[b * 3 + v] - p[b * 3 + u] * p[a * 3 + v];
    }
    if (area < 0)
        ids.reverse();
    const out: number[] = [];
    while (ids.length > 3) {
        let found = false;
        for (let i = 0; i < ids.length; i++) {
            const a = ids[(i + ids.length - 1) % ids.length], b = ids[i], c = ids[(i + 1) % ids.length];
            if (cross(a, b, c) < 1e-14)
                continue;
            if (ids.some(id => id !== a && id !== b && id !== c && cross(a, b, id) >= -1e-14 && cross(b, c, id) >= -1e-14 && cross(c, a, id) >= -1e-14))
                continue;
            out.push(a, b, c);
            ids.splice(i, 1);
            found = true;
            break;
        }
        if (!found)
            return null;
    }
    out.push(...ids);
    if (normal < 0)
        for (let f = 0; f < out.length; f += 3) {
            const t = out[f];
            out[f] = out[f + 2];
            out[f + 2] = t;
        }
    return out;
}
