import { HairBrush } from './HairBrush';
import { CONFIG, ToolMode, TOOL_HINTS } from '../core/PrototypeConfig';
import { HairProjection } from '../hair/HairScreenCutter';
import { SurfaceHairSimulation } from './SurfaceHairSimulation';
import { SurfaceScreenCutter } from './SurfaceScreenCutter';
import { BoundHairMesh } from './BoundHairMesh';
import { StrokePlaneCutter } from './StrokePlaneCutter';
/** 下方起点锁定旋转；上方可从背景划入头发，剪切立即生效。 */
export class SalonGesture {
    action: 'idle' | ToolMode = 'idle';
    startX = 0;
    startY = 0;
    x = 0;
    y = 0;
    feedback = '滑动可连续剪发；头下方空白区域拖动旋转';
    private scale = 1;
    private tool: ToolMode = 'cut';
    private cutX = 0;
    private cutY = 0;
    private readonly shave = new SurfaceScreenCutter();
    private readonly brush = new HairBrush();
    private windTime = 0;
    private windX = 0;
    private windY = 1;
    private readonly scissors = new StrokePlaneCutter();
    private readonly ray = { ox: 0, oy: 0, oz: 0, dx: 0, dy: 0, dz: 0 };
    constructor(private readonly sim: SurfaceHairSimulation, private readonly projection: HairProjection, private readonly yUp = true) { }
    hitsHair(x: number, y: number): boolean {
        if (this.sim.debugScalp)
            return false;
        const mesh = this.sim.cutMesh || BoundHairMesh.from(this.sim);
        mesh.evaluate(this.sim);
        this.projection.rayAt(x, y, this.ray);
        const hair = mesh.distance(this.ray, this.sim), head = this.sim.occluder.distance(this.ray, this.sim.yaw, this.sim.pitch);
        return Number.isFinite(hair) && hair < head - 1e-5;
    }
    /** 下颌下方为旋转候选区；头发本身优先剪切，分界不随俯仰跳动。 */
    rotationBoundary(): number {
        this.projection.project(0, 1.04, 0, this.boundary);
        return this.boundary.y;
    }
    isRotationArea(y: number): boolean { return this.yUp ? y <= this.rotationBoundary() : y >= this.rotationBoundary(); }
    private readonly boundary = { x: 0, y: 0, depth: 0 };
    begin(x: number, y: number, mode: ToolMode = 'cut', scale = 1): void {
        this.cancel();
        if (this.sim.paused)
            return;
        this.tool = mode;
        this.scale = Math.max(.1, scale);
        this.cutX = this.startX = this.x = x;
        this.cutY = this.startY = this.y = y;
        this.sim.stop();
        this.action = this.isRotationArea(y) && !this.hitsHair(x, y) ? 'rotate' : mode === 'rotate' ? 'idle' : mode;
        this.feedback = this.action === 'rotate' ? '正在旋转：上下各三十度，松手即停' : TOOL_HINTS[mode];
        this.windX = 0;
        this.windY = this.yUp ? 1 : -1;
        this.scissors.begin();
        this.shave.begin();
        this.sweep(x, y, x, y);
    }
    private sweep(x0: number, y0: number, x1: number, y1: number): void {
        if (this.action === 'cut' && Math.hypot(x1 - this.cutX, y1 - this.cutY) >= 2 * this.scale) {
            this.scissors.sweep(this.sim, this.projection, this.cutX, this.cutY, x1, y1, CONFIG.cutRadiusPixels * this.scale);
            this.cutX = x1;
            this.cutY = y1;
        }
        if (this.action === 'comb')
            this.brush.comb(this.sim, this.projection, x0, y0, x1, y1, 24 * this.scale, this.scale);
        if (this.action === 'blow' && Math.hypot(x1 - x0, y1 - y0) > this.scale) {
            this.windX = x1 - x0;
            this.windY = y1 - y0;
        }
        if (this.action === 'shave')
            this.shave.sweep(this.sim, this.projection, x0, y0, x1, y1, CONFIG.shaveRadiusPixels * this.scale, true);
    }
    move(x: number, y: number): void {
        if (this.sim.paused) {
            this.cancel();
            return;
        }
        if (this.action === 'rotate')
            this.sim.dragTurn((x - this.x) * CONFIG.dragRadiansPerPixel / this.scale, (y - this.y) * (this.yUp ? 1 : -1) * CONFIG.dragRadiansPerPixel / this.scale);
        if (x !== this.x || y !== this.y)
            this.sweep(this.x, this.y, x, y);
        this.x = x;
        this.y = y;
    }
    end(x: number, y: number): void {
        this.move(x, y);
        this.feedback = TOOL_HINTS[this.tool];
        this.cancel();
    }
    update(dt: number): void {
        if (this.action !== 'blow' || this.sim.paused || this.sim.debugScalp || !Number.isFinite(dt) || dt <= 0)
            return;
        this.windTime += Math.min(dt, .05);
        if (this.windTime + 1e-9 >= .05) {
            this.brush.blow(this.sim, this.projection, this.x, this.y, this.windX, this.windY, 46 * this.scale, this.windTime);
            this.windTime = 0;
        }
    }
    cancel(): void { this.brush.end(); this.windTime = 0; this.action = 'idle'; this.shave.end(); this.scissors.end(); this.sim.stop(); }
}
