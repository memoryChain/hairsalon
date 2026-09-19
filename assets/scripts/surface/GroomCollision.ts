import type { HeadAsset } from './ScalpTopology';
import type { HeadRaycast } from './HeadRaycast';
const COLUMNS = 96, ROWS = 48;
/** 从真实头模外侧采样径向包络。每次换头构建，热路径只查询表格。 */
export class GroomCollision {
    private readonly radii = new Float64Array(COLUMNS * (ROWS + 1));
    private readonly local = new Float64Array(512 * 3);
    private rigidCorners = 0;
    private readonly delta = { x: 0, y: 0, z: 0 };
    constructor(private readonly asset: HeadAsset, raycast: HeadRaycast) {
        const center = asset.center, ray = { ox: 0, oy: 0, oz: 0, dx: 0, dy: 0, dz: 0 };
        let extent = 0;
        for (let i = 0; i < asset.headPositions.length; i += 3)
            extent = Math.max(extent, Math.hypot(asset.headPositions[i] - center[0], asset.headPositions[i + 1] - center[1], asset.headPositions[i + 2] - center[2]));
        extent += .5;
        for (let row = 0; row <= ROWS; row++) {
            const angle = row / ROWS * Math.PI, y = Math.cos(angle), r = Math.sin(angle);
            for (let col = 0; col < COLUMNS; col++) {
                const az = col / COLUMNS * Math.PI * 2, x = r * Math.cos(az), z = r * Math.sin(az);
                ray.ox = center[0] + x * extent; ray.oy = center[1] + y * extent; ray.oz = center[2] + z * extent;
                ray.dx = -x; ray.dy = -y; ray.dz = -z;
                const distance = raycast.distance(ray, 0, 0);
                this.radii[row * COLUMNS + col] = Number.isFinite(distance) ? Math.max(0, extent - distance) : 0;
            }
        }
    }
    private correction(x: number, y: number, z: number): boolean {
        const c = this.asset.center;
        x -= c[0]; y -= c[1]; z -= c[2];
        const distance = Math.hypot(x, y, z);
        if (distance < 1e-8) return false;
        const u = ((Math.atan2(z, x) / (Math.PI * 2) + 1) % 1) * COLUMNS;
        const v = Math.acos(Math.max(-1, Math.min(1, y / distance))) / Math.PI * ROWS;
        const col = Math.floor(u), row = Math.min(ROWS - 1, Math.floor(v)), a = u - col, b = v - row, next = (col + 1) % COLUMNS;
        const r = this.radii;
        const r00 = r[row * COLUMNS + col], r01 = r[row * COLUMNS + next], r10 = r[(row + 1) * COLUMNS + col], r11 = r[(row + 1) * COLUMNS + next];
        const detailMargin = (Math.max(r00, r01, r10, r11) - Math.min(r00, r01, r10, r11)) * .5;
        const radius = (r[row * COLUMNS + col] * (1 - a) + r[row * COLUMNS + next] * a) * (1 - b)
            + (r[(row + 1) * COLUMNS + col] * (1 - a) + r[(row + 1) * COLUMNS + next] * a) * b + .012 + detailMargin;
        if (distance >= radius) return false;
        const push = (radius - distance) / distance;
        this.delta.x = x * push; this.delta.y = y * push; this.delta.z = z * push;
        return true;
    }
    /** 保持根圈不动，修正当前与上一帧各自姿态下的截面和跨截面连线。 */
    constrain(p: Float64Array, base: number, corners: number, rings: number, yaw: number, pitch: number, preserveSections = false): void {
        this.rigidCorners = preserveSections ? corners : 0;
        const count = corners * rings, local = this.local, center = this.asset.center;
        if (count * 3 > local.length) throw new Error('发束碰撞缓存不足');
        const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
        for (let i = 0; i < count; i++) {
            const k = (base + i) * 3, x = p[k] - center[0], y = p[k + 1] - center[1], z = p[k + 2] - center[2], b = -sp * y + cp * z;
            local[i * 3] = cy * x - sy * b + center[0];
            local[i * 3 + 1] = cp * y + sp * z + center[1];
            local[i * 3 + 2] = sy * x + cy * b + center[2];
        }
        for (let pass = 0; pass < 4; pass++) {
            let changed = false;
            for (let i = corners; i < count; i++) {
                const k = i * 3;
                if (this.correction(local[k], local[k + 1], local[k + 2])) {
                    changed = true;
                    this.move(i,1);
                }
            }
            for (let ring = 1; ring < rings; ring++)
                for (let j = 0; j < corners; j++) {
                    const a = ring * corners + j, b = ring * corners + (j + 1) % corners;
                    changed = this.edge(a, b, corners) || changed;
                    changed = this.edge(a - corners, a, corners) || changed;
                    changed = this.edge(b - corners, a, corners) || changed;
                    changed = this.face(a - corners, b - corners, a, corners) || changed;
                    changed = this.face(b - corners, b, a, corners) || changed;
                }
            if (!changed) break;
        }
        for (let i = corners; i < count; i++) {
            const k = i * 3, at = (base + i) * 3, x = local[k] - center[0], y = local[k + 1] - center[1], z = local[k + 2] - center[2];
            const a = cy * x + sy * z, b = -sy * x + cy * z;
            p[at] = a + center[0]; p[at + 1] = cp * y - sp * b + center[1]; p[at + 2] = sp * y + cp * b + center[2];
        }
    }
    private move(id:number,scale:number):void {
        const corners=this.rigidCorners,start=corners?Math.floor(id/corners)*corners:id,end=corners?start+corners:start+1,p=this.local;
        for(let i=start;i<end;i++){const k=i*3;p[k]+=this.delta.x*scale;p[k+1]+=this.delta.y*scale;p[k+2]+=this.delta.z*scale;}
    }
    private face(a: number, b: number, c: number, fixed: number): boolean {
        const p = this.local, ia = a * 3, ib = b * 3, ic = c * 3;
        if (!this.correction((p[ia] + p[ib] + p[ic]) / 3, (p[ia + 1] + p[ib + 1] + p[ic + 1]) / 3, (p[ia + 2] + p[ib + 2] + p[ic + 2]) / 3)) return false;
        const scale = 3 / (Number(a >= fixed) + Number(b >= fixed) + Number(c >= fixed));
        for (let j = 0; j < 3; j++) {
            const id = j === 0 ? a : j === 1 ? b : c;
            if (id < fixed) continue;
            if(this.rigidCorners && ((j>0&&Math.floor(id/fixed)===Math.floor(a/fixed)) || (j>1&&Math.floor(id/fixed)===Math.floor(b/fixed))))continue;
            this.move(id,scale);
        }
        return true;
    }
    private edge(a: number, b: number, fixed: number): boolean {
        const p = this.local, ia = a * 3, ib = b * 3;
        if (!this.correction((p[ia] + p[ib]) * .5, (p[ia + 1] + p[ib + 1]) * .5, (p[ia + 2] + p[ib + 2]) * .5)) return false;
        const scale = a < fixed ? 2 : 1;
        this.move(b,scale);
        if (a >= fixed && (!this.rigidCorners || Math.floor(a/fixed)!==Math.floor(b/fixed)))this.move(a,1);
        return true;
    }
}
