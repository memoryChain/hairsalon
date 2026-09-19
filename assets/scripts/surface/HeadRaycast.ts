import { unposeRay } from './HeadPose';
import { HeadAsset } from './ScalpTopology';
import { Ray } from '../hair/HairSimulation';
interface Branch {
    min: number[];
    max: number[];
    left?: Branch;
    right?: Branch;
    faces?: number[];
}
/** 导入时构建 BVH，输入时用于真实头模遮挡；不使用拟合椭球。 */
export class HeadRaycast {
    private readonly tree: Branch;
    private hitFace = -1;
    private hitU = 0;
    private hitV = 0;
    private readonly ray: Ray = { ox: 0, oy: 0, oz: 0, dx: 0, dy: 0, dz: 0 };
    constructor(private readonly asset: HeadAsset) {
        const p = asset.headPositions, indices = asset.headIndices;
        const build = (faces: number[]): Branch => {
            const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
            for (const f of faces)
                for (let j = 0; j < 3; j++)
                    for (let a = 0; a < 3; a++) {
                        const v = p[indices[f * 3 + j] * 3 + a];
                        min[a] = Math.min(min[a], v);
                        max[a] = Math.max(max[a], v);
                    }
            const node: Branch = { min, max };
            if (faces.length <= 12) {
                node.faces = faces;
                return node;
            }
            let axis = 0;
            for (let a = 1; a < 3; a++)
                if (max[a] - min[a] > max[axis] - min[axis])
                    axis = a;
            const center = (f: number) => p[indices[f * 3] * 3 + axis] + p[indices[f * 3 + 1] * 3 + axis] + p[indices[f * 3 + 2] * 3 + axis];
            faces.sort((a, b) => center(a) - center(b));
            const mid = faces.length >> 1;
            node.left = build(faces.slice(0, mid));
            node.right = build(faces.slice(mid));
            return node;
        };
        this.tree = build(Array.from({ length: indices.length / 3 }, (_, i) => i));
    }
    distance(world: Ray, yaw: number, pitch = 0): number {
        this.hitFace = -1;
        unposeRay(world, yaw, pitch, this.asset.center, this.ray);
        return this.visit(this.tree, Infinity);
    }
    localSurface(ray: Ray, out: { x: number; y: number; z: number; nx: number; ny: number; nz: number; face: number; u: number; v: number }): boolean {
        const distance = this.distance(ray, 0, 0);
        if (!Number.isFinite(distance) || this.hitFace < 0) return false;
        out.x = ray.ox + ray.dx * distance; out.y = ray.oy + ray.dy * distance; out.z = ray.oz + ray.dz * distance;
        out.face = this.hitFace; out.u = this.hitU; out.v = this.hitV;
        const p = this.asset.headPositions, ix = this.asset.headIndices, normals = this.asset.headNormals;
        const a = ix[out.face * 3] * 3, b = ix[out.face * 3 + 1] * 3, c = ix[out.face * 3 + 2] * 3;
        if (normals) {
            const w = 1 - out.u - out.v;
            out.nx = normals[a] * w + normals[b] * out.u + normals[c] * out.v;
            out.ny = normals[a + 1] * w + normals[b + 1] * out.u + normals[c + 1] * out.v;
            out.nz = normals[a + 2] * w + normals[b + 2] * out.u + normals[c + 2] * out.v;
        } else {
            const ux = p[b] - p[a], uy = p[b + 1] - p[a + 1], uz = p[b + 2] - p[a + 2], vx = p[c] - p[a], vy = p[c + 1] - p[a + 1], vz = p[c + 2] - p[a + 2];
            out.nx = uy * vz - uz * vy; out.ny = uz * vx - ux * vz; out.nz = ux * vy - uy * vx;
        }
        const length = Math.hypot(out.nx, out.ny, out.nz) || 1;
        out.nx /= length; out.ny /= length; out.nz /= length;
        return true;
    }
    private visit(node: Branch, best: number): number {
        const r = this.ray;
        let lo = 0, hi = best;
        for (let axis = 0; axis < 3; axis++) {
            const o = axis === 0 ? r.ox : axis === 1 ? r.oy : r.oz, d = axis === 0 ? r.dx : axis === 1 ? r.dy : r.dz;
            if (Math.abs(d) < 1e-12) {
                if (o < node.min[axis] || o > node.max[axis])
                    return best;
                continue;
            }
            const a = (node.min[axis] - o) / d, b = (node.max[axis] - o) / d;
            lo = Math.max(lo, Math.min(a, b));
            hi = Math.min(hi, Math.max(a, b));
            if (lo > hi)
                return best;
        }
        if (!node.faces) {
            best = this.visit(node.left!, best);
            return this.visit(node.right!, best);
        }
        const p = this.asset.headPositions, ix = this.asset.headIndices;
        for (const f of node.faces) {
            const a = ix[f * 3] * 3, b = ix[f * 3 + 1] * 3, c = ix[f * 3 + 2] * 3;
            const ux = p[b] - p[a], uy = p[b + 1] - p[a + 1], uz = p[b + 2] - p[a + 2], vx = p[c] - p[a], vy = p[c + 1] - p[a + 1], vz = p[c + 2] - p[a + 2];
            const hx = r.dy * vz - r.dz * vy, hy = r.dz * vx - r.dx * vz, hz = r.dx * vy - r.dy * vx, det = ux * hx + uy * hy + uz * hz;
            if (Math.abs(det) < 1e-10)
                continue;
            const tx = r.ox - p[a], ty = r.oy - p[a + 1], tz = r.oz - p[a + 2], u = (tx * hx + ty * hy + tz * hz) / det;
            if (u < -1e-9 || u > 1 + 1e-9)
                continue;
            const qx = ty * uz - tz * uy, qy = tz * ux - tx * uz, qz = tx * uy - ty * ux, v = (r.dx * qx + r.dy * qy + r.dz * qz) / det;
            if (v < -1e-9 || u + v > 1 + 1e-9)
                continue;
            const t = (vx * qx + vy * qy + vz * qz) / det;
            if (t > 1e-7 && t < best) {
                best = t; this.hitFace = f; this.hitU = u; this.hitV = v;
            }
        }
        return best;
    }
}
