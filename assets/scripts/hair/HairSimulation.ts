import { CONFIG, HairStyle } from '../core/PrototypeConfig';
import { createPreset, Strand, makeStrand } from './HairPresets';

export type Ray = { ox: number; oy: number; oz: number; dx: number; dy: number; dz: number };
export type HairHit = { strand: Strand; segment: number; t: number; distance: number };
export class HairSimulation {
    strands: Strand[] = [];
    debris: Strand[] = [];
    style: HairStyle = 'spiky';
    yaw = 0; targetYaw = 0; cuts = 0; revision = 0; paused = false;
    private accumulator = 0;
    private physicsYaw = 0;
    private previousStep: number = CONFIG.step;
    private nextId = 1000;
    constructor() { this.reset('spiky'); }

    reset(style = this.style): void {
        this.style = style; this.strands = createPreset(style); this.debris.length = 0;
        this.yaw = this.targetYaw = this.physicsYaw = 0; this.previousStep = CONFIG.step;
        this.accumulator = 0; this.cuts = 0; this.revision++;
    }
    turn(delta: number): void { this.targetYaw += Math.max(-0.8, Math.min(0.8, delta)); }
    dragTurn(delta: number): void {
        if (this.paused || !Number.isFinite(delta) || delta === 0) return;
        // 拖动直接控制角色；只绑定发根，不整体旋转活动粒子。
        this.yaw += delta; this.targetYaw = this.yaw;
        const c = Math.cos(this.yaw), s = Math.sin(this.yaw);
        for (const strand of this.strands) this.pin(strand, c, s);
        this.revision++;
    }
    stop(): void { this.targetYaw = this.yaw; }
    clearVelocity(): void {
        this.accumulator = 0; this.stop(); this.physicsYaw = this.yaw; this.previousStep = CONFIG.step;
        for (const s of this.strands) s.previous.set(s.p);
        for (const s of this.debris) s.previous.set(s.p);
    }
    advance(dt: number): number {
        if (this.paused || !Number.isFinite(dt) || dt <= 0) return 0;
        this.accumulator += Math.min(dt, CONFIG.step * CONFIG.maxSteps);
        let steps = 0;
        while (this.accumulator + 1e-10 >= CONFIG.step && steps < CONFIG.maxSteps) {
            this.step(); this.accumulator -= CONFIG.step; steps++;
        }
        return steps;
    }
    private step(): void {
        const h = CONFIG.step;
        this.yaw += Math.max(-CONFIG.maxTurnSpeed * h, Math.min(CONFIG.maxTurnSpeed * h, this.targetYaw - this.yaw));
        const startYaw = this.physicsYaw, delta = this.yaw - startYaw;
        const substeps = Math.min(CONFIG.maxRotationSubsteps, Math.max(1, Math.ceil(Math.abs(delta) / CONFIG.rotationStepAngle)));
        const substep = h / substeps;
        // 大幅拖动只细分毛发求解，不让人物限速追赶手指。
        for (let part = 1; part <= substeps; part++) {
            const angle = startYaw + delta * part / substeps, c = Math.cos(angle), s = Math.sin(angle);
            for (let i = 0; i < this.strands.length; i++) this.solve(this.strands[i], c, s, substep);
            for (let i = this.debris.length - 1; i >= 0; i--) {
                const strand = this.debris[i];
                this.solve(strand, c, s, substep); strand.age += substep;
                if (strand.age >= CONFIG.debrisLifetime) { this.debris.splice(i, 1); this.revision++; }
            }
            this.previousStep = substep;
        }
        this.physicsYaw = this.yaw;
    }
    private pin(strand: Strand, c: number, s: number): void {
        const r = strand.rest, p = strand.p;
        p[0] = c * r[0] + s * r[2]; p[1] = r[1]; p[2] = -s * r[0] + c * r[2];
    }
    private solve(a: Strand, c: number, sn: number, h: number): void {
        const p = a.p, prev = a.previous, r = a.rest;
        const h2 = h * h;
        const keep = Math.exp(-(a.attached ? (a.style === 'spiky' ? 4 : 2.3) : 1.3) * h) * h / this.previousStep;
        const spring = a.attached ? (a.style === 'spiky' ? 75 : 9) : 0;
        for (let i = 0; i < a.count; i++) {
            const k = i * 3;
            if (i === 0 && a.attached) {
                prev[0] = p[0]; prev[1] = p[1]; prev[2] = p[2];
                this.pin(a, c, sn); continue;
            }
            const x = p[k], y = p[k + 1], z = p[k + 2];
            p[k] += (x - prev[k]) * keep + ((c * r[k] + sn * r[k + 2]) - x) * spring * h2;
            p[k + 1] += (y - prev[k + 1]) * keep + ((r[k + 1] - y) * spring - (a.attached ? 1.5 : 7)) * h2;
            p[k + 2] += (z - prev[k + 2]) * keep + ((-sn * r[k] + c * r[k + 2]) - z) * spring * h2;
            prev[k] = x; prev[k + 1] = y; prev[k + 2] = z;
        }
        for (let iteration = 0; iteration < CONFIG.iterations; iteration++) {
            for (let i = 1; i < a.count; i++) {
                const k = i * 3, j = k - 3;
                const dx = p[k] - p[j], dy = p[k + 1] - p[j + 1], dz = p[k + 2] - p[j + 2];
                const len = Math.hypot(dx, dy, dz);
                const weight = i === 1 && a.attached ? 1 : 0.5;
                const correction = len > 1e-9 ? (len - a.lengths[i]) / len : 0;
                p[k] -= dx * correction * weight; p[k + 1] -= dy * correction * weight; p[k + 2] -= dz * correction * weight;
                if (weight === 0.5) { p[j] += dx * correction * 0.5; p[j + 1] += dy * correction * 0.5; p[j + 2] += dz * correction * 0.5; }
                // 第一段约束生长方向，避免整簇绕发根自由倒伏。
                if (a.attached && i === 1) {
                    const strength = 1 - Math.pow(1 - (a.style === 'spiky' ? 0.45 : 0.25), h / CONFIG.step);
                    p[k] += (c * r[k] + sn * r[k + 2] - p[k]) * strength;
                    p[k + 1] += (r[k + 1] - p[k + 1]) * strength;
                    p[k + 2] += (-sn * r[k] + c * r[k + 2] - p[k + 2]) * strength;
                }
            }
            for (let i = a.attached ? 1 : 0; i < a.count; i++) this.collide(a, i, c, sn);
            if (a.attached) this.pin(a, c, sn);
        }
    }
    private collide(a: Strand, i: number, c: number, sn: number): void {
        const k = i * 3, p = a.p, margin = a.radius[i] * 0.65;
        // 在角色局部空间检测椭球，再变回世界空间。
        let x = c * p[k] - sn * p[k + 2], y = p[k + 1], z = sn * p[k] + c * p[k + 2];
        for (let collider = 0; collider < 3; collider++) {
            const cy = collider === 0 ? CONFIG.headY : collider === 1 ? 0.85 : 0.35;
            const rx = (collider === 0 ? CONFIG.headX : collider === 1 ? 0.19 : 0.8) + margin;
            const ry = (collider === 0 ? CONFIG.headHeight : collider === 1 ? 0.36 : 0.3) + margin;
            const rz = (collider === 0 ? CONFIG.headZ : collider === 1 ? 0.19 : 0.34) + margin;
            const qx = x / rx, qy = (y - cy) / ry, qz = z / rz;
            const length = Math.hypot(qx, qy, qz);
            if (length < 1 && length > 1e-8) { x /= length; y = cy + (y - cy) / length; z /= length; }
        }
        p[k] = c * x + sn * z; p[k + 1] = y; p[k + 2] = -sn * x + c * z;
        if (p[k + 1] < CONFIG.floorY + margin) {
            p[k + 1] = CONFIG.floorY + margin;
            a.previous[k] += (p[k] - a.previous[k]) * 0.35;
            a.previous[k + 1] = p[k + 1];
            a.previous[k + 2] += (p[k + 2] - a.previous[k + 2]) * 0.35;
        }
    }
    cut(a: Strand, segment: number, t: number): boolean {
        if (!a.attached || segment < 1 || segment >= a.count || !Number.isFinite(t)) return false;
        t = Math.max(0.0001, Math.min(0.9999, t));
        let before = 0, after = 0;
        for (let i = 1; i < segment; i++) before += a.lengths[i];
        for (let i = segment + 1; i < a.count; i++) after += a.lengths[i];
        before += a.lengths[segment] * t; after += a.lengths[segment] * (1 - t);
        if (before < CONFIG.minCutLength || after < CONFIG.minCutLength) return false;
        const j = (segment - 1) * 3, k = segment * 3;
        const split = (data: Float64Array) => [
            data[j] + (data[k] - data[j]) * t, data[j + 1] + (data[k + 1] - data[j + 1]) * t,
            data[j + 2] + (data[k + 2] - data[j + 2]) * t];
        const cutP = split(a.p), cutPrev = split(a.previous), cutRest = split(a.rest);
        const radius = a.radius[segment - 1] + (a.radius[segment] - a.radius[segment - 1]) * t;
        const dropped = makeStrand(this.nextId++, [...cutP, ...a.p.slice(k)], [radius, ...a.radius.slice(segment)], a.style);
        dropped.previous.set([...cutPrev, ...a.previous.slice(k)]);
        dropped.lengths[1] = a.lengths[segment] * (1 - t);
        for (let i = 2; i < dropped.count; i++) dropped.lengths[i] = a.lengths[segment + i - 1];
        dropped.attached = false;
        a.p = new Float64Array([...a.p.slice(0, k), ...cutP]);
        a.previous = new Float64Array([...a.previous.slice(0, k), ...cutPrev]);
        a.rest = new Float64Array([...a.rest.slice(0, k), ...cutRest]);
        a.radius = new Float64Array([...a.radius.slice(0, segment), radius]);
        a.lengths = a.lengths.slice(0, segment + 1); a.lengths[segment] *= t; a.count = segment + 1;
        if (this.debris.length >= CONFIG.maxDebris) this.debris.shift();
        this.debris.push(dropped); this.cuts++; this.revision++;
        return true;
    }
    pick(ray: Ray): HairHit | null {
        const occluder = headRayDistance(ray, this.yaw);
        let best: HairHit | null = null;
        for (const strand of this.strands) {
            for (let i = 1; i < strand.count; i++) {
                const p = strand.p, j = (i - 1) * 3, k = i * 3;
                const vx = p[k] - p[j], vy = p[k + 1] - p[j + 1], vz = p[k + 2] - p[j + 2];
                const wx = ray.ox - p[j], wy = ray.oy - p[j + 1], wz = ray.oz - p[j + 2];
                const b = ray.dx * vx + ray.dy * vy + ray.dz * vz, cc = vx * vx + vy * vy + vz * vz;
                const d = ray.dx * wx + ray.dy * wy + ray.dz * wz, e = vx * wx + vy * wy + vz * wz;
                const den = cc - b * b;
                const t = Math.max(0, Math.min(1, den > 1e-12 ? (e - b * d) / den : 0));
                const along = Math.max(0, b * t - d);
                const dx = wx + along * ray.dx - t * vx, dy = wy + along * ray.dy - t * vy, dz = wz + along * ray.dz - t * vz;
                const radius = strand.radius[i - 1] + (strand.radius[i] - strand.radius[i - 1]) * t + 0.018;
                const depth = along - Math.sqrt(Math.max(0, radius * radius - dx * dx - dy * dy - dz * dz));
                if (dx * dx + dy * dy + dz * dz <= radius * radius && depth > 0 && depth < occluder && (!best || depth < best.distance))
                    best = { strand, segment: i, t, distance: depth };
            }
        }
        return best;
    }
    cutRay(ray: Ray): boolean { const hit = this.pick(ray); return !!hit && this.cut(hit.strand, hit.segment, hit.t); }
}

export function headRayDistance(ray: Ray, yaw: number): number {
    const c = Math.cos(yaw), s = Math.sin(yaw);
    const ox = (c * ray.ox - s * ray.oz) / CONFIG.headX, oy = (ray.oy - CONFIG.headY) / CONFIG.headHeight,
        oz = (s * ray.ox + c * ray.oz) / CONFIG.headZ;
    const dx = (c * ray.dx - s * ray.dz) / CONFIG.headX, dy = ray.dy / CONFIG.headHeight,
        dz = (s * ray.dx + c * ray.dz) / CONFIG.headZ;
    const a = dx * dx + dy * dy + dz * dz, b = ox * dx + oy * dy + oz * dz, cc = ox * ox + oy * oy + oz * oz - 1;
    const disc = b * b - a * cc;
    if (disc < 0) return Infinity;
    const t = (-b - Math.sqrt(disc)) / a;
    return t >= 0 ? t : Infinity;
}
