import { HeadAsset } from './ScalpTopology';
import { HeadRaycast } from './HeadRaycast';
/** 仅用于查看覆盖域；细分后重新贴合可见头模，不参与发缕生成。 */
export class ScalpDisplayMesh {
    readonly positions: Float64Array;
    readonly indices: number[];
    readonly sourceFaces: number[];
    constructor(asset: HeadAsset) {
        const vertices = asset.scalpPositions.slice();
        for (let k = 0; k < vertices.length; k += 3) {
            const n = asset.scalpNormals, length = Math.hypot(n[k], n[k + 1], n[k + 2]);
            for (let axis = 0; axis < 3; axis++) vertices[k + axis] += n[k + axis] / length * .012;
        }
        let indices = asset.scalpIndices.slice();
        let faces = indices.filter((_, i) => i % 3 === 0).map((_, i) => i);
        for (let step = 0; step < 2; step++) {
            const edges = new Map<string, number>(), next: number[] = [], parents: number[] = [];
            const midpoint = (a: number, b: number): number => {
                const key = Math.min(a, b) + ':' + Math.max(a, b);
                const found = edges.get(key); if (found !== undefined) return found;
                const id = vertices.length / 3;
                for (let axis = 0; axis < 3; axis++) vertices.push((vertices[a * 3 + axis] + vertices[b * 3 + axis]) * .5);
                edges.set(key, id); return id;
            };
            for (let f = 0; f < indices.length; f += 3) {
                const a = indices[f], b = indices[f + 1], c = indices[f + 2];
                const ab = midpoint(a, b), bc = midpoint(b, c), ca = midpoint(c, a);
                next.push(a, ab, ca, ab, b, bc, ca, bc, c, ab, bc, ca);
                parents.push(faces[f / 3], faces[f / 3], faces[f / 3], faces[f / 3]);
            }
            indices = next; faces = parents;
        }
        const full = asset.characterMesh;
        const surface = full ? { ...asset, headPositions: full.positions, headIndices: full.indices, headNormals: full.normals } : asset;
        const raycast = new HeadRaycast(surface), center = asset.center;
        let reach = 0;
        for (let k = 0; k < surface.headPositions.length; k += 3)
            reach = Math.max(reach, Math.hypot(surface.headPositions[k] - center[0], surface.headPositions[k + 1] - center[1], surface.headPositions[k + 2] - center[2]));
        reach += 1;
        const hit = { x: 0, y: 0, z: 0, nx: 0, ny: 0, nz: 0, face: 0, u: 0, v: 0 };
        const ray = { ox: 0, oy: 0, oz: 0, dx: 0, dy: 0, dz: 0 };
        for (let k = 0; k < vertices.length; k += 3) {
            const x = vertices[k] - center[0], y = vertices[k + 1] - center[1], z = vertices[k + 2] - center[2];
            const length = Math.hypot(x, y, z);
            ray.dx = -x / length; ray.dy = -y / length; ray.dz = -z / length;
            ray.ox = center[0] - ray.dx * reach; ray.oy = center[1] - ray.dy * reach; ray.oz = center[2] - ray.dz * reach;
            if (!raycast.localSurface(ray, hit)) throw new Error('头皮显示面未命中头模');
            // 只修正靠内的部分，保留原覆盖域在耳后等凹处的连续跨接。
            const radius = Math.hypot(hit.x - center[0], hit.y - center[1], hit.z - center[2]);
            const outward = Math.max(0, radius + .004 - length);
            vertices[k] -= ray.dx * outward;
            vertices[k + 1] -= ray.dy * outward;
            vertices[k + 2] -= ray.dz * outward;
        }
        // 耳后和太阳穴还需要检查三角形内部；修正共享顶点，不能拆边补片。
        const scales = new Float64Array(vertices.length / 3);
        for (let iteration = 0; iteration < 6; iteration++) {
            scales.fill(1); let changed = false;
            for (let f = 0; f < indices.length; f += 3) {
                const a = indices[f] * 3, b = indices[f + 1] * 3, c = indices[f + 2] * 3;
                let scale = 1;
                for (let i = 0; i <= 4; i++) for (let j = 0; j <= 4 - i; j++) {
                    const wa = i / 4, wb = j / 4, wc = 1 - wa - wb;
                    const x = vertices[a] * wa + vertices[b] * wb + vertices[c] * wc - center[0];
                    const y = vertices[a + 1] * wa + vertices[b + 1] * wb + vertices[c + 1] * wc - center[1];
                    const z = vertices[a + 2] * wa + vertices[b + 2] * wb + vertices[c + 2] * wc - center[2];
                    const length = Math.hypot(x, y, z);
                    ray.dx = -x / length; ray.dy = -y / length; ray.dz = -z / length;
                    ray.ox = center[0] - ray.dx * reach; ray.oy = center[1] - ray.dy * reach; ray.oz = center[2] - ray.dz * reach;
                    const radius = reach - raycast.distance(ray, 0);
                    if (radius + .002 > length) scale = Math.max(scale, (radius + .004) / length);
                }
                if (scale > 1) {
                    changed = true;
                    for (let j = 0; j < 3; j++) scales[indices[f + j]] = Math.max(scales[indices[f + j]], scale);
                }
            }
            if (!changed) break;
            for (let k = 0; k < vertices.length; k += 3) for (let axis = 0; axis < 3; axis++)
                vertices[k + axis] = center[axis] + (vertices[k + axis] - center[axis]) * scales[k / 3];
        }
        this.positions = new Float64Array(vertices); this.indices = indices; this.sourceFaces = faces;
    }
}
