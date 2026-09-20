import { HAIR_PRESETS, createStyleCurve } from '../core/HairstyleCatalog';
import { FiberRig } from './FiberRig';
import { addFiberDebris } from './FiberDebris';
import { buildFibers, partitionRoots } from './FiberLayout';
import { pose } from './HeadPose';
import { BoundHairMesh } from './BoundHairMesh';
import { CONFIG, HairStyle } from '../core/PrototypeConfig';
import { HeadAsset, ScalpTopology } from './ScalpTopology';
import { HeadRaycast } from './HeadRaycast';
import { GroomCollision } from './GroomCollision';
import { createHairlineAsset } from './HairlineProfile';
export interface Point3 {
    x: number;
    y: number;
    z: number;
}
export interface SurfaceClipping {
    p: Float64Array;
    previous: Float64Array;
    age: number;
    style: HairStyle;
    groups?: Uint16Array;
    forces?: Float32Array;
}
const ZERO = [0, 0, 0];
const PEAKS = [[-.50, .84, .04, .67], [.02, .999, -.04, .81], [.59, .80, -.05, .68], [-.82, .55, -.1, .53], [.85, .48, -.15, .51], [-.35, .70, -.63, .58], [.43, .64, -.63, .57]];
/** 共享头皮顶点上的连续长度场；任一顶点仅有一份位置，相邻面不能各自裂开。 */
export class SurfaceHairSimulation {
    topology!: ScalpTopology;
    private baseTopology!: ScalpTopology;
    private readonly hairlines = new Map<HairStyle, ScalpTopology>();
    occluder!: HeadRaycast;
    groomCollision!: GroomCollision;
    p!: Float64Array;
    previous!: Float64Array;
    lengths!: Float64Array;
    private normalSize!: Float64Array;
    private styleCurves!: Float64Array;
    private groomOffsets!: Float64Array;
    private groomed = false;
    private target!: Float64Array;
    private scratch!: Float64Array;
    fiberRig!: FiberRig;
    fiberMesh!: BoundHairMesh;
    cutMesh: BoundHairMesh | null = null;
    pitch = 0;
    private priorPitch = 0;
    private physicsPitch = 0;
    yaw = 0;
    targetYaw = 0;
    private priorYaw = 0;
    private physicsYaw = 0;
    style: HairStyle = 'spiky';
    initialGrowth = 1;
    cuts = 0;
    revision = 0;
    paused = false;
    debugScalp = false;
    readonly debris: SurfaceClipping[] = [];
    private accumulator = 0;
    private readonly point: Point3 = { x: 0, y: 0, z: 0 };
    constructor(asset: HeadAsset) { this.setHead(asset); }
    setHead(asset: HeadAsset): void {
        this.topology = this.baseTopology = new ScalpTopology(asset);
        this.hairlines.clear();
        this.occluder = new HeadRaycast(asset);
        this.groomCollision = new GroomCollision(asset, this.occluder);
        const n = this.topology.count;
        this.p = new Float64Array(n * 3);
        this.previous = new Float64Array(n * 3);
        this.lengths = new Float64Array(n);
        this.normalSize = new Float64Array(n);
        this.styleCurves = new Float64Array(n * 6);
        this.groomOffsets = new Float64Array(n * 3);
        this.target = new Float64Array(n * 3);
        this.scratch = new Float64Array(n * 3);
        this.reset(this.style);
    }
    reset(style = this.style, growth = 1): void {
        this.style = style;
        this.initialGrowth=Number.isFinite(growth)?Math.max(1,Math.min(2.6,growth)):1;
        let topology = this.hairlines.get(style);
        if (!topology) {
            topology = new ScalpTopology(createHairlineAsset(this.baseTopology, this.occluder, style));
            this.hairlines.set(style, topology);
        }
        this.topology = topology;
        this.groomOffsets.fill(0);
        this.groomed = false;
        this.yaw = this.targetYaw = this.priorYaw = this.physicsYaw = 0;
        this.pitch = this.priorPitch = this.physicsPitch = 0;
        this.cutMesh = null;
        this.cuts = 0;
        this.accumulator = 0;
        this.debris.length = 0;
        const r = this.topology.roots, c = this.topology.asset.center, extent = [0, 0, 0], head = this.topology.asset.headPositions;
        for (let i = 0; i < head.length; i++)
            extent[i % 3] = Math.max(extent[i % 3], Math.abs(head[i] - c[i % 3]));
        const activeRoots = new Uint8Array(this.topology.count);
        for (const cell of partitionRoots(this)) for (const id of cell.boundary) activeRoots[id] = 1;
        for (let i = 0; i < this.topology.count; i++) {
            const k = i * 3;
            let x = (r[k] - c[0]) / extent[0], y = (r[k + 1] - c[1]) / extent[1], z = (r[k + 2] - c[2]) / extent[2];
            const norm = Math.hypot(x, y, z);
            x /= norm;
            y /= norm;
            z /= norm;
            let size = .11;
            if (style === 'spiky') {
                for (const peak of PEAKS) {
                    const d = Math.hypot(x - peak[0], y - peak[1], z - peak[2]);
                    size = Math.max(size, .11 + peak[3] * Math.pow(Math.max(0, 1 - d / .56), 1.3));
                }
            }
            else {
                size = .15 + .07 * (1 - y * y);
            }
            if (style !== 'spiky' && style !== 'long') {
                const curve = createStyleCurve(style, Array.from(r.subarray(k, k + 3)), Array.from(this.topology.normals.subarray(k, k + 3)), c, i);
                this.styleCurves.set(curve.control, i * 6);
                this.styleCurves.set(curve.end, i * 6 + 3);
            }
            this.normalSize[i] = size;
            this.lengths[i] = activeRoots[i];
            this.restPoint(i, this.lengths[i], 0, this.point);
            this.p[k] = this.point.x;
            this.p[k + 1] = this.point.y;
            this.p[k + 2] = this.point.z;
        }
        this.previous.set(this.p);
        this.fiberMesh = buildFibers(this);
        this.revision++;
    }
    /** 根部和顶端之间的连续导向，剃光时 t=0 精确回到输入头皮。 */
    private restPoint(i: number, t: number, yaw: number, out: Point3, pitch = this.pitch): void {
        const k = i * 3, r = this.topology.roots, n = this.topology.normals;
        const h = this.normalSize[i] * t;
        let x = r[k] + n[k] * h, y = r[k + 1] + n[k + 1] * h, z = r[k + 2] + n[k + 2] * h;
        if (this.style !== 'long' && this.style !== 'spiky') {
            const q = 1 - t, a = q * q * q, b = 3 * q * q * t, d = t * t * t, h = 3 * q * t * t, curve = this.styleCurves, at = i * 6, bulge = HAIR_PRESETS[this.style].bulge;
            x = a * r[k] + b * (r[k] + n[k] * bulge) + h * curve[at] + d * curve[at + 3];
            y = a * r[k + 1] + b * (r[k + 1] + n[k + 1] * bulge) + h * curve[at + 1] + d * curve[at + 4];
            z = a * r[k + 2] + b * (r[k + 2] + n[k + 2] * bulge) + h * curve[at + 2] + d * curve[at + 5];
        }
        else if (this.style === 'long') {
            const center = this.topology.asset.center, rx = r[k] - center[0], rz = r[k + 2] - center[2];
            let az = Math.atan2(rx, rz), ex: number, ez: number, ey: number;
            const noise = Math.sin(i * 12.9898) * .018;
            if (rz > .12 && Math.abs(rx) < .12) {
                ex = rx;
                ez = .65;
                ey = 1.88 + noise;
            }
            else {
                if (rz > 0 && Math.abs(az) < .95)
                    az = (rx < 0 ? -1 : 1) * .95;
                ex = Math.sin(az) * (.77 + noise);
                ez = Math.cos(az) * (.66 + noise);
                ey = .59 + .065 * Math.cos(az * 3) + noise;
            }
            ex += center[0];
            ez += center[2];
            const q = 1 - t, a = q * q * q, b = 3 * q * q * t, c = 3 * q * t * t, d = t * t * t;
            x = a * r[k] + b * (r[k] + n[k] * .26) + c * (center[0] + (ex - center[0]) * 1.08) + d * ex;
            y = a * r[k + 1] + b * (r[k + 1] + n[k + 1] * .26) + c * Math.min(r[k + 1] + .04, 1.95) + d * ey;
            z = a * r[k + 2] + b * (r[k + 2] + n[k + 2] * .26) + c * (center[2] + (ez - center[2]) * 1.08) + d * ez;
        }
        x=r[k]+(x-r[k])*this.initialGrowth;
        y=r[k+1]+(y-r[k+1])*this.initialGrowth;
        z=r[k+2]+(z-r[k+2])*this.initialGrowth;
        if (this.groomed) {
            const weight = t * t;
            x += this.groomOffsets[k] * weight;
            y += this.groomOffsets[k + 1] * weight;
            z += this.groomOffsets[k + 2] * weight;
        }
        pose(x, y, z, yaw, pitch, this.topology.asset.center, out);
    }
    pointAt(i: number, t: number, out: Point3, previous = false): void {
        const max = this.lengths[i], yaw = previous ? this.priorYaw : this.yaw, k = i * 3;
        t = Math.max(0, Math.min(max, t));
        this.restPoint(i, t, yaw, out, previous ? this.priorPitch : this.pitch);
        if (max <= 0)
            return;
        const x = out.x, y = out.y, z = out.z;
        this.restPoint(i, max, yaw, out, previous ? this.priorPitch : this.pitch);
        const p = previous ? this.previous : this.p, w = (t / max) * (t / max);
        out.x = x + (p[k] - out.x) * w;
        out.y = y + (p[k + 1] - out.y) * w;
        out.z = z + (p[k + 2] - out.z) * w;
    }
    get previousYaw(): number { return this.priorYaw; }
    get previousPitch(): number { return this.priorPitch; }
    displacementAt(i: number, out: Point3, previous = false): void {
        this.restPoint(i, this.lengths[i], previous ? this.priorYaw : this.yaw, out, previous ? this.priorPitch : this.pitch);
        const p = previous ? this.previous : this.p, k = i * 3;
        out.x = p[k] - out.x;
        out.y = p[k + 1] - out.y;
        out.z = p[k + 2] - out.z;
    }
    /** 将梳理产生的目标变化同步给物理导向，当前/上一位置同移以保留已有速度。 */
    setGroomTargets(sums: Float64Array, counts: Float64Array): void {
        this.groomed = true;
        for (let i = 0; i < counts.length; i++)
            if (counts[i] > 0) {
                const k = i * 3, x = sums[k] / counts[i] - this.groomOffsets[k], y = sums[k + 1] / counts[i] - this.groomOffsets[k + 1], z = sums[k + 2] / counts[i] - this.groomOffsets[k + 2], w = this.lengths[i] ** 2;
                this.groomOffsets[k] += x;
                this.groomOffsets[k + 1] += y;
                this.groomOffsets[k + 2] += z;
                pose(x * w, y * w, z * w, this.yaw, this.pitch, ZERO, this.point);
                this.p[k] += this.point.x;
                this.p[k + 1] += this.point.y;
                this.p[k + 2] += this.point.z;
                pose(x * w, y * w, z * w, this.priorYaw, this.priorPitch, ZERO, this.point);
                this.previous[k] += this.point.x;
                this.previous[k + 1] += this.point.y;
                this.previous[k + 2] += this.point.z;
            }
    }
    turn(delta: number): void { this.targetYaw += Math.max(-.8, Math.min(.8, delta)); }
    dragTurn(delta: number, vertical = 0): void {
        if (this.paused || !Number.isFinite(delta) || !Number.isFinite(vertical))
            return;
        this.pitch = Math.max(-Math.PI / 6, Math.min(Math.PI / 6, this.pitch + vertical));
        this.yaw += delta;
        this.targetYaw = this.yaw;
        this.bindShaved();
        this.revision++;
    }
    stop(): void { this.targetYaw = this.yaw; }
    clearVelocity(): void {
        this.fiberRig?.clearWindVelocity();
        this.previous.set(this.p);
        this.priorPitch = this.physicsPitch = this.pitch;
        this.priorYaw = this.physicsYaw = this.yaw;
        this.accumulator = 0;
        this.stop();
        for (const d of this.debris)
            d.previous.set(d.p);
    }
    private bindShaved(): void {
        for (let i = 0; i < this.lengths.length; i++)
            if (this.lengths[i] === 0) {
                this.restPoint(i, 0, this.yaw, this.point);
                const k = i * 3;
                this.p[k] = this.point.x;
                this.p[k + 1] = this.point.y;
                this.p[k + 2] = this.point.z;
            }
    }
    advance(dt: number): number {
        if (this.paused || !Number.isFinite(dt) || dt <= 0)
            return 0;
        this.accumulator += Math.min(dt, CONFIG.step * CONFIG.maxSteps);
        let steps = 0;
        while (this.accumulator + 1e-10 >= CONFIG.step) {
            this.yaw += Math.max(-CONFIG.maxTurnSpeed * CONFIG.step, Math.min(CONFIG.maxTurnSpeed * CONFIG.step, this.targetYaw - this.yaw));
            this.solve();
            this.accumulator -= CONFIG.step;
            steps++;
        }
        return steps;
    }
    private solve(): void {
        this.fiberRig.stepWind(CONFIG.step);
        const h = CONFIG.step, c = Math.cos(this.yaw), s = Math.sin(this.yaw), keep = Math.exp(-HAIR_PRESETS[this.style].damping * h), spring = HAIR_PRESETS[this.style].spring;
        this.priorPitch = this.physicsPitch;
        this.physicsPitch = this.pitch;
        this.priorYaw = this.physicsYaw;
        this.physicsYaw = this.yaw;
        for (let i = 0; i < this.lengths.length; i++) {
            const k = i * 3;
            this.restPoint(i, this.lengths[i], this.yaw, this.point);
            this.target[k] = this.point.x;
            this.target[k + 1] = this.point.y;
            this.target[k + 2] = this.point.z;
            for (let a = 0; a < 3; a++) {
                const at = k + a, old = this.p[at];
                this.p[at] += (old - this.previous[at]) * keep + (this.target[at] - old) * spring * h * h;
                this.previous[at] = old;
            }
        }
        // 平滑位移场，保持相邻区域共同运动；仅共享数值顶点，不叠加覆盖模型。
        for (let iteration = 0; iteration < 2; iteration++) {
            this.scratch.set(this.p);
            for (let i = 0; i < this.lengths.length; i++) {
                const k = i * 3, neighbors = this.topology.neighbors[i];
                for (let a = 0; a < 3; a++) {
                    let sum = 0;
                    for (const j of neighbors)
                        sum += this.scratch[j * 3 + a] - this.target[j * 3 + a];
                    const delta = this.scratch[k + a] - this.target[k + a];
                    this.p[k + a] = this.target[k + a] + delta * .88 + sum / neighbors.length * .12;
                }
            }
        }
        for (let i = 0; i < this.lengths.length; i++) {
            const k = i * 3, length = this.lengths[i], limit = HAIR_PRESETS[this.style].sway * length;
            const dx = this.p[k] - this.target[k], dy = this.p[k + 1] - this.target[k + 1], dz = this.p[k + 2] - this.target[k + 2], d = Math.hypot(dx, dy, dz);
            if (d > limit) {
                const scale = limit / d;
                this.p[k] = this.target[k] + dx * scale;
                this.p[k + 1] = this.target[k + 1] + dy * scale;
                this.p[k + 2] = this.target[k + 2] + dz * scale;
            }
            // 根部法线约束，防止惯性把连续表面拉回头皮内；复杂凹头型仍需完整碰撞解算。
            const r = this.topology.roots, n = this.topology.normals;
            pose(r[k], r[k + 1], r[k + 2], this.yaw, this.pitch, this.topology.asset.center, this.point);
            const rx = this.point.x, ry = this.point.y, rz = this.point.z;
            pose(n[k], n[k + 1], n[k + 2], this.yaw, this.pitch, ZERO, this.point);
            const nx = this.point.x, ny = this.point.y, nz = this.point.z;
            const away = (this.p[k] - rx) * nx + (this.p[k + 1] - ry) * ny + (this.p[k + 2] - rz) * nz;
            const min = Math.min(.035, this.normalSize[i] * .2) * length;
            if (this.style === 'spiky' && away < min) {
                this.p[k] += nx * (min - away);
                this.p[k + 1] += ny * (min - away);
                this.p[k + 2] += nz * (min - away);
            }
            if (length === 0) {
                this.p[k] = rx;
                this.p[k + 1] = ry;
                this.p[k + 2] = rz;
            }
        }
        for (let i = this.debris.length - 1; i >= 0; i--) {
            const d = this.debris[i];
            d.age += h;
            if (d.age > CONFIG.debrisLifetime) {
                this.debris.splice(i, 1);
                continue;
            }
            for (let k = 0; k < d.p.length; k += 3)
                for (let a = 0; a < 3; a++) {
                    const at = k + a, old = d.p[at];
                    d.p[at] += (old - d.previous[at]) * .98 - (a === 1 ? 7 * h * h : 0) + (d.forces && d.age < .28 ? d.forces[Math.floor(k / 9) * 3 + a] * h * h : 0);
                    d.previous[at] = old;
                    if (a === 1 && d.p[at] < CONFIG.floorY) {
                        d.p[at] = CONFIG.floorY;
                        d.previous[at] = CONFIG.floorY;
                    }
                }
        }
    }
    /** 原子更新共享长度场，保留新端点速度；脱落部分为原表面与新表面之间的闭合薄体。 */
    trim(next: ArrayLike<number>): number {
        if (next.length !== this.lengths.length)
            throw new Error('长度场数量不匹配');
        let potential = 0;
        for (let i = 0; i < next.length; i++) {
            if (!Number.isFinite(next[i]))
                throw new Error('长度场含无效数值');
            if (this.lengths[i] - Math.max(0, next[i]) >= .002)
                potential++;
        }
        if (!potential)
            return 0;
        const mesh = this.cutMesh || this.fiberMesh, oldBound = mesh.snapshot(this);
        const changed = new Uint8Array(this.lengths.length);
        let count = 0;
        for (let i = 0; i < next.length; i++) {
            const value = Math.max(0, Math.min(this.lengths[i], next[i]));
            if (this.lengths[i] - value < .002)
                continue;
            const k = i * 3;
            this.pointAt(i, value, this.point);
            this.p[k] = this.point.x;
            this.p[k + 1] = this.point.y;
            this.p[k + 2] = this.point.z;
            this.pointAt(i, value, this.point, true);
            this.previous[k] = this.point.x;
            this.previous[k + 1] = this.point.y;
            this.previous[k + 2] = this.point.z;
            this.lengths[i] = value;
            changed[i] = 1;
            count++;
        }
        if (!count)
            return 0;
        const removed: number[] = [], groups: number[] = [], touched = new Set<number>();
        for (let f = 0; f < mesh.indices.length; f += 3)
            for (let j = 0; j < 3; j++)
                for (const id of mesh.bindings[mesh.indices[f + j]].guides)
                    if (changed[id])
                        touched.add(mesh.groups[f / 3] || 0);
        for (let f = 0; f < mesh.indices.length; f += 3)
            if (touched.has(mesh.groups[f / 3] || 0)) {
                removed.push(mesh.indices[f], mesh.indices[f + 1], mesh.indices[f + 2]);
                groups.push(mesh.groups[f / 3] || 0);
            }
        addFiberDebris(this, oldBound.p, oldBound.previous, removed, groups);
        this.cuts++;
        this.revision++;
        return count;
    }
    get shavedFaces(): number {
        let n = 0;
        const ix = this.topology.triangles;
        for (let f = 0; f < ix.length; f += 3)
            if (this.lengths[ix[f]] === 0 && this.lengths[ix[f + 1]] === 0 && this.lengths[ix[f + 2]] === 0)
                n++;
        return n;
    }
}
