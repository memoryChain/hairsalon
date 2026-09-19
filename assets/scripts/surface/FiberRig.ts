import { groomWidth } from '../core/HairGrooming';
import { HAIR_PRESETS, createStyleCurve } from '../core/HairstyleCatalog';
import { pose } from './HeadPose';
import type { SurfaceHairSimulation } from './SurfaceHairSimulation';
import type { RootCell } from './FiberLayout';
const LEVELS = [0, .12, .32, .56, .80, 1];
const ZERO = [0, 0, 0];
const PEAKS = [[-.50, .84, .04, .67], [.02, .999, -.04, .81], [.59, .80, -.05, .68], [-.82, .55, -.10, .53], [.85, .48, -.15, .51], [-.35, .70, -.63, .58], [.43, .64, -.63, .57]];
interface Fiber {
    ids: number[];
    root: number[];
    normal: number[];
    control: number[];
    end: number[];
    offsets: number[][];
    base: number;
    group: number;
    restLength: number;
    tipShape: number;
    baseEnd: number[];
    groomed: boolean;
}
/** 每缕使用局部曲线和随切线转动的截面；避免相邻导向端点不同把细缕拉成宽片。 */
export class FiberRig {
    readonly levels: number[];
    readonly fibers: Fiber[] = [];
    readonly positions: Float64Array;
    readonly wind: Float64Array;
    readonly previousWind: Float64Array;
    private readonly windVelocity: Float64Array;
    private windy = false;
    private readonly initialCorrection: Float64Array;
    private readonly correctedLength: Float64Array;
    private readonly uncorrected = new Float64Array(512 * 3);
    private readonly point = { x: 0, y: 0, z: 0 };
    private readonly direction = { x: 0, y: 0, z: 0 };
    constructor(sim: SurfaceHairSimulation, cells: RootCell[]) {
        this.levels = sim.style === 'afro' ? [0,.08,.18,.32,.48,.64,.78,.9,1] : LEVELS;
        const r = sim.topology.roots, n = sim.topology.normals, c = sim.topology.asset.center;
        let samples = 0;
        for (let group = 0; group < cells.length; group++) {
            const ids = cells[group].boundary, root = [0, 0, 0], normal = [0, 0, 0];
            for (const id of ids)
                for (let a = 0; a < 3; a++) {
                    root[a] += r[id * 3 + a] / ids.length;
                    normal[a] += n[id * 3 + a] / ids.length;
                }
            const norm = Math.hypot(...normal);
            for (let a = 0; a < 3; a++)
                normal[a] /= norm;
            const rx = root[0] - c[0], ry = root[1] - c[1], rz = root[2] - c[2], noise = Math.sin(group * 12.9898) * .018;
            let end: number[], control: number[];
            if (sim.style !== 'spiky') {
                ({ end, control } = createStyleCurve(sim.style, root, normal, c, group));
            }
            else {
                let best = PEAKS[0], distance = Infinity;
                for (const peak of PEAKS) {
                    const d = (normal[0] - peak[0]) ** 2 + (normal[1] - peak[1]) ** 2 + (normal[2] - peak[2]) ** 2;
                    if (d < distance) {
                        distance = d;
                        best = peak;
                    }
                }
                if (normal[1] < .05)
                    end = [root[0] + normal[0] * .08, root[1] + .06, root[2] + normal[2] * .08];
                else
                    end = [c[0] + best[0] * (.57 + best[3] * .86) + (normal[0] - best[0]) * .16, c[1] + best[1] * (.73 + best[3] * .86) + (normal[1] - best[1]) * .09 + noise, c[2] + best[2] * (.54 + best[3] * .86) + (normal[2] - best[2]) * .16];
                control = root.map((v, a) => v * .38 + end[a] * .62 + normal[a] * .12);
            }
            const offsets = ids.map(id => [r[id * 3] - root[0], r[id * 3 + 1] - root[1], r[id * 3 + 2] - root[2]]);
            this.fibers.push({ ids, root, normal, control, end, offsets, base: samples, group, baseEnd: end.slice(), groomed: false, tipShape: .5 + .5 * Math.sin(rx * 17 + rz * 23 + ry * 9), restLength: curveLength(root, normal, control, end, HAIR_PRESETS[sim.style].bulge) });
            samples += ids.length * this.levels.length;
        }
        this.positions = new Float64Array(samples * 3);
        this.initialCorrection = new Float64Array(samples * 3);
        this.correctedLength = new Float64Array(cells.length); this.correctedLength.fill(NaN);
        this.wind = new Float64Array(cells.length * 3);
        this.previousWind = new Float64Array(cells.length * 3);
        this.windVelocity = new Float64Array(cells.length * 3);
    }
    /** 梳理只改现有采样曲线；切过的网格及交点绑定保持原样。 */
    comb(group: number, x: number, y: number, z: number, amount: number, sim: SurfaceHairSimulation, out: {
        x: number;
        y: number;
        z: number;
    }): void {
        const f = this.fibers[group], r = f.root, n = f.normal, c = f.control, e = f.end, bulge = HAIR_PRESETS[sim.style].bulge;
        const ox = e[0], oy = e[1], oz = e[2], dn = Math.hypot(x, y, z) || 1;
        x /= dn;
        y /= dn;
        z /= dn;
        const span = Math.hypot(e[0] - r[0], e[1] - r[1], e[2] - r[2]) || 1;
        const sx = (e[0] - r[0]) / span, sy = (e[1] - r[1]) / span, sz = (e[2] - r[2]) / span;
        const cosine = Math.max(-1, Math.min(1, sx * x + sy * y + sz * z)), angle = Math.acos(cosine);
        let tx = x - sx * cosine, ty = y - sy * cosine, tz = z - sz * cosine;
        let tangentLength = Math.hypot(tx, ty, tz);
        if (tangentLength < 1e-6 && cosine < 0) {
            const outward = sx * n[0] + sy * n[1] + sz * n[2];
            tx = n[0] - sx * outward;
            ty = n[1] - sy * outward;
            tz = n[2] - sz * outward;
            tangentLength = Math.hypot(tx, ty, tz);
            if (tangentLength < 1e-6) {
                tx = Math.abs(sy) < .9 ? -sz : sy;
                ty = Math.abs(sy) < .9 ? 0 : -sx;
                tz = Math.abs(sy) < .9 ? sx : 0;
                tangentLength = Math.hypot(tx, ty, tz);
            }
        }
        const turn = angle * amount, lateral = Math.sin(turn) / Math.max(tangentLength, 1e-6);
        let vx = sx * Math.cos(turn) + tx * lateral, vy = sy * Math.cos(turn) + ty * lateral, vz = sz * Math.cos(turn) + tz * lateral;
        const vn = Math.hypot(vx, vy, vz) || 1;
        vx /= vn;
        vy /= vn;
        vz /= vn;
        const length = span + (f.restLength * .90 - span) * amount;
        e[0] = r[0] + vx * length;
        e[1] = r[1] + vy * length;
        e[2] = r[2] + vz * length;
        const gain = Math.min(1, amount * 1.6);
        c[0] += (r[0] + (vx * .52 + n[0] * .20) * length - c[0]) * gain;
        c[1] += (r[1] + (vy * .52 + n[1] * .20) * length - c[1]) * gain;
        c[2] += (r[2] + (vz * .52 + n[2] * .20) * length - c[2]) * gain;
        // 控制点落入头部近似碰撞体时向外推，允许长发绕过头侧而不是锁死在根部切平面。
        const center = sim.topology.asset.center;
        for (const point of [c, e]) {
            const px = (point[0] - center[0]) / .64, py = (point[1] - center[1]) / .78, pz = (point[2] - center[2]) / .60, d = Math.hypot(px, py, pz);
            if (d < 1 && d > 1e-6) {
                point[0] = center[0] + px * .64 / d;
                point[1] = center[1] + py * .78 / d;
                point[2] = center[2] + pz * .60 / d;
            }
        }
        // 约束曲线弧长，反复梳理不会像橡皮筋一样无限拉长。
        for (let i = 0; i < 12; i++) {
            const actual = curveLength(r, n, c, e, bulge), ratio = f.restLength / Math.max(actual, 1e-6);
            if (Math.abs(actual - f.restLength) < f.restLength * .001) break;
            for (let a = 0; a < 3; a++) {
                c[a] = r[a] + (c[a] - r[a]) * ratio;
                e[a] = r[a] + (e[a] - r[a]) * ratio;
            }
        }
        f.groomed = true;
        out.x = e[0] - ox;
        out.y = e[1] - oy;
        out.z = e[2] - oz;
    }
    blow(group: number, x: number, y: number, z: number, dt: number): void {
        const k = group * 3, v = this.windVelocity;
        v[k] += x * 14 * dt;
        v[k + 1] += y * 14 * dt;
        v[k + 2] += z * 14 * dt;
        const speed = Math.hypot(v[k], v[k + 1], v[k + 2]);
        if (speed > 2.5)
            for (let a = 0; a < 3; a++)
                v[k + a] *= 2.5 / speed;
        this.windy = true;
    }
    stepWind(dt: number): void {
        if (!this.windy)
            return;
        const p = this.wind, v = this.windVelocity;
        this.previousWind.set(p);
        let energy = 0;
        for (let group = 0; group < this.fibers.length; group++) {
            const k = group * 3, limit = Math.min(.32, this.fibers[group].restLength * .22);
            for (let a = 0; a < 3; a++) {
                v[k + a] = (v[k + a] - p[k + a] * 32 * dt) * Math.exp(-4.5 * dt);
                p[k + a] += v[k + a] * dt;
            }
            const length = Math.hypot(p[k], p[k + 1], p[k + 2]);
            if (length > limit)
                for (let a = 0; a < 3; a++) {
                    p[k + a] *= limit / length;
                    v[k + a] *= .5;
                }
            for (let a = 0; a < 3; a++)
                energy += Math.abs(p[k + a]) + Math.abs(v[k + a]);
        }
        if (energy < 1e-5) {
            p.fill(0);
            v.fill(0);
            this.previousWind.fill(0);
            this.windy = false;
        }
    }
    clearWindVelocity(): void { this.windVelocity.fill(0); this.previousWind.set(this.wind); }
    evaluate(sim: SurfaceHairSimulation, previous: boolean): Float64Array {
        const p = this.positions, yaw = previous ? sim.previousYaw : sim.yaw, pitch = previous ? sim.previousPitch : sim.pitch;
        for (const fiber of this.fibers) {
            let length = 0, dx = 0, dy = 0, dz = 0;
            for (const id of fiber.ids) {
                length += sim.lengths[id];
                sim.displacementAt(id, this.point, previous);
                dx += this.point.x;
                dy += this.point.y;
                dz += this.point.z;
            }
            length /= fiber.ids.length;
            dx /= fiber.ids.length;
            dy /= fiber.ids.length;
            dz /= fiber.ids.length;
            const wind = previous ? this.previousWind : this.wind, wi = fiber.group * 3;
            dx += wind[wi];
            dy += wind[wi + 1];
            dz += wind[wi + 2];
            if (!fiber.groomed && fiber.restLength < .5) {
                // 极短发的摆幅按实际长度限制，避免停转惯性把发体推回头皮。
                const movement = Math.hypot(dx, dy, dz), limit = fiber.restLength * .10 * length;
                if (movement > limit) { const gain = limit / movement; dx *= gain; dy *= gain; dz *= gain; }
            }
            const root = fiber.root, n = fiber.normal, c = fiber.control, e = fiber.end;
            let prevX = n[0], prevY = n[1], prevZ = n[2], qx = 0, qy = 0, qz = 0, qw = 1;
            for (let ring = 0; ring < this.levels.length; ring++) {
                const t = this.levels[ring] * length, q = 1 - t, bulge = HAIR_PRESETS[sim.style].bulge;
                const p1x = root[0] + n[0] * bulge, p1y = root[1] + n[1] * bulge, p1z = root[2] + n[2] * bulge;
                const x = q * q * q * root[0] + 3 * q * q * t * p1x + 3 * q * t * t * c[0] + t * t * t * e[0], y = q * q * q * root[1] + 3 * q * q * t * p1y + 3 * q * t * t * c[1] + t * t * t * e[1], z = q * q * q * root[2] + 3 * q * q * t * p1z + 3 * q * t * t * c[2] + t * t * t * e[2];
                let tx = 3 * q * q * (p1x - root[0]) + 6 * q * t * (c[0] - p1x) + 3 * t * t * (e[0] - c[0]), ty = 3 * q * q * (p1y - root[1]) + 6 * q * t * (c[1] - p1y) + 3 * t * t * (e[1] - c[1]), tz = 3 * q * q * (p1z - root[2]) + 6 * q * t * (c[2] - p1z) + 3 * t * t * (e[2] - c[2]);
                const d = Math.hypot(tx, ty, tz) || 1;
                tx /= d;
                ty /= d;
                tz /= d;
                // 最短旋转将根部法线对准曲线切线；反向时固定备用轴，避免截面翻跳。
                let ax = prevY * tz - prevZ * ty, ay = prevZ * tx - prevX * tz, az = prevX * ty - prevY * tx, w = 1 + prevX * tx + prevY * ty + prevZ * tz;
                if (w < 1e-8) {
                    ax = -prevY;
                    ay = prevX;
                    az = 0;
                    w = 0;
                    if (Math.hypot(ax, ay) < 1e-8) {
                        ax = 1;
                        ay = 0;
                    }
                }
                const al = Math.hypot(ax, ay, az, w);
                ax /= al;
                ay /= al;
                az /= al;
                w /= al;
                const mx = w * qx + ax * qw + ay * qz - az * qy, my = w * qy - ax * qz + ay * qw + az * qx, mz = w * qz + ax * qy - ay * qx + az * qw, mw = w * qw - ax * qx - ay * qy - az * qz;
                qx = ax = mx;
                qy = ay = my;
                qz = az = mz;
                qw = w = mw;
                prevX = tx;
                prevY = ty;
                prevZ = tz;
                const preset = HAIR_PRESETS[sim.style];
                // 主束中段保留体积，发尾集中收尖，避免从根部一路匀速变细成绳条。
                const width = sim.style === 'spiky' ? (1 + .12 * Math.sin(Math.PI * t)) * (1 - .97 * Math.pow(t, 2.3 + fiber.tipShape * .6)) : sim.style === 'bob' ? (1 + .10 * Math.sin(Math.PI * t)) * (1 - (.80 + .10 * fiber.tipShape) * Math.pow(t, 3.5)) : groomWidth(sim.style, t, fiber.tipShape);
                for (let corner = 0; corner < fiber.ids.length; corner++) {
                    const o = fiber.offsets[corner], ux = 2 * (ay * o[2] - az * o[1]), uy = 2 * (az * o[0] - ax * o[2]), uz = 2 * (ax * o[1] - ay * o[0]);
                    const ox = (o[0] + w * ux + ay * uz - az * uy) * width, oy = (o[1] + w * uy + az * ux - ax * uz) * width, oz = (o[2] + w * uz + ax * uy - ay * ux) * width;
                    // 根部先按每个头皮点的法线起立，再平滑接到发束的造型截面。
                    const short = fiber.restLength < .5;
                    const join = Math.max(0, Math.min(1, (t - (short ? .56 : .12)) / .44));
                    const blend = join * join * (3 - 2 * join);
                    const id = fiber.ids[corner] * 3, roots = sim.topology.roots, normals = sim.topology.normals;
                    const height = (.028 + bulge * .12) * Math.min(1, t / .12) + .025 * Math.max(0, t - .12);
                    const lx = (roots[id] + normals[id] * height) * (1 - blend) + (x + ox) * blend;
                    const ly = (roots[id + 1] + normals[id + 1] * height) * (1 - blend) + (y + oy) * blend;
                    const lz = (roots[id + 2] + normals[id + 2] * height) * (1 - blend) + (z + oz) * blend;
                    pose(lx, ly, lz, yaw, pitch, sim.topology.asset.center, this.direction);
                    const at = (fiber.base + ring * fiber.ids.length + corner) * 3;
                    p[at] = this.direction.x + dx * t * t * blend;
                    p[at + 1] = this.direction.y + dy * t * t * blend;
                    p[at + 2] = this.direction.z + dz * t * t * blend;
                }
            }
            if (length > 0) {
                if (fiber.groomed) sim.groomCollision.constrain(p, fiber.base, fiber.ids.length, this.levels.length, yaw, pitch, true);
                else if (fiber.restLength < .5) this.constrainInitial(sim, fiber, length, yaw, pitch);
            }
        }
        return p;
    }
    private constrainInitial(sim: SurfaceHairSimulation, fiber: Fiber, length: number, yaw: number, pitch: number): void {
        const start = fiber.base * 3, count = fiber.ids.length * this.levels.length * 3;
        const p = this.positions, correction = this.initialCorrection;
        if (this.correctedLength[fiber.group] !== length) {
            for (let k = 0; k < count; k++) this.uncorrected[k] = p[start + k];
            sim.groomCollision.constrain(p, fiber.base, fiber.ids.length, this.levels.length, yaw, pitch);
            // 发梢整圈平移避让，保持原收尖比例，不能逐顶点推成平板。
            const tip = (this.levels.length - 1) * fiber.ids.length * 3;
            let tx = 0, ty = 0, tz = 0, push = 0;
            for (let k = tip; k < count; k += 3) {
                tx += this.uncorrected[k]; ty += this.uncorrected[k + 1]; tz += this.uncorrected[k + 2];
                push = Math.max(push, Math.hypot(p[start + k] - this.uncorrected[k], p[start + k + 1] - this.uncorrected[k + 1], p[start + k + 2] - this.uncorrected[k + 2]));
            }
            if (push > 0) {
                const center = sim.topology.asset.center;
                tx = tx / fiber.ids.length - center[0]; ty = ty / fiber.ids.length - center[1]; tz = tz / fiber.ids.length - center[2];
                const gain = (push + .002) / Math.max(1e-6, Math.hypot(tx, ty, tz));
                for (let k = tip; k < count; k += 3) {
                    p[start + k] = this.uncorrected[k] + tx * gain;
                    p[start + k + 1] = this.uncorrected[k + 1] + ty * gain;
                    p[start + k + 2] = this.uncorrected[k + 2] + tz * gain;
                }
            }
            const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
            for (let k = 0; k < count; k += 3) {
                const x = p[start + k] - this.uncorrected[k], y = p[start + k + 1] - this.uncorrected[k + 1], z = p[start + k + 2] - this.uncorrected[k + 2];
                const localZ = -sp * y + cp * z;
                correction[start + k] = cy * x - sy * localZ;
                correction[start + k + 1] = cp * y + sp * z;
                correction[start + k + 2] = sy * x + cy * localZ;
            }
            this.correctedLength[fiber.group] = length;
        } else {
            for (let k = start; k < start + count; k += 3) {
                pose(correction[k], correction[k + 1], correction[k + 2], yaw, pitch, ZERO, this.direction);
                p[k] += this.direction.x; p[k + 1] += this.direction.y; p[k + 2] += this.direction.z;
            }
        }
    }
}
function curveLength(r: number[], n: number[], c: number[], e: number[], bulge: number): number {
    let px = r[0], py = r[1], pz = r[2], length = 0;
    for (let i = 1; i <= 16; i++) {
        const t = i / 16, q = 1 - t, a = q * q * q, b = 3 * q * q * t, d = 3 * q * t * t, f = t * t * t;
        const x = a * r[0] + b * (r[0] + n[0] * bulge) + d * c[0] + f * e[0], y = a * r[1] + b * (r[1] + n[1] * bulge) + d * c[1] + f * e[1], z = a * r[2] + b * (r[2] + n[2] * bulge) + d * c[2] + f * e[2];
        length += Math.hypot(x - px, y - py, z - pz);
        px = x;
        py = y;
        pz = z;
    }
    return length;
}
