import { CONFIG, PALETTE } from '../core/PrototypeConfig';
import { Strand } from './HairPresets';
import { fillStrandRings } from './HairShape';

/** 固定容量，只有拓扑变化时创建新的有效视图；静态和动态几何共用。 */
export class GeometryBuffer {
    readonly positions: Float32Array;
    readonly colors: Float32Array;
    count = 0;
    private visibleCount = -1;
    readonly minPos = { x: -8, y: -2, z: -8 };
    readonly maxPos = { x: 8, y: 6, z: 8 };
    readonly view: { positions: Float32Array; colors: Float32Array; uvs?: Float32Array; minPos: { x: number; y: number; z: number }; maxPos: { x: number; y: number; z: number } };
    constructor(readonly capacity = CONFIG.maxVertices as number) {
        this.positions = new Float32Array(capacity * 3); this.colors = new Float32Array(capacity * 4);
        this.view = { positions: this.positions, colors: this.colors, minPos: this.minPos, maxPos: this.maxPos };
    }
    triangle(ax: number, ay: number, az: number, bx: number, by: number, bz: number,
        cx: number, cy: number, cz: number, color: readonly number[]): void {
        if (this.count + 3 > this.capacity) throw new Error('几何缓冲容量不足');
        let nx = (by - ay) * (cz - az) - (bz - az) * (cy - ay);
        let ny = (bz - az) * (cx - ax) - (bx - ax) * (cz - az);
        let nz = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
        const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
        const light = 0.70 + 0.30 * Math.max(0, nx * -0.4 + ny * 0.65 + nz * 0.6);
        this.vertex(ax, ay, az, color, light); this.vertex(bx, by, bz, color, light); this.vertex(cx, cy, cz, color, light);
    }
    private vertex(x: number, y: number, z: number, color: readonly number[], light: number): void {
        const p = this.count * 3, c = this.count * 4;
        this.positions[p] = x; this.positions[p + 1] = y; this.positions[p + 2] = z;
        this.colors[c] = color[0] * light; this.colors[c + 1] = color[1] * light;
        this.colors[c + 2] = color[2] * light; this.colors[c + 3] = 1; this.count++;
    }
    finish(): typeof this.view {
        if (this.count !== this.visibleCount) {
            this.visibleCount = this.count;
            this.view.positions = this.positions.subarray(0, this.count * 3);
            this.view.colors = this.colors.subarray(0, this.count * 4);
        }
        return this.view;
    }
}

export class HairGeometry extends GeometryBuffer {
    private readonly rings = new Float64Array(16 * CONFIG.radialSides * 3);
    update(strands: Strand[], debris: Strand[]): void {
        this.count = 0;
        for (let i = 0; i < strands.length; i++) this.append(strands[i]);
        for (let i = 0; i < debris.length; i++) this.append(debris[i]);
        this.finish();
    }
    private append(s: Strand): void {
        const sides = CONFIG.radialSides, p = s.p, rings = this.rings;
        const color = PALETTE[s.style];
        fillStrandRings(s, rings);
        for (let i = 1; i < s.count; i++) for (let j = 0; j < sides; j++) {
            const a = ((i - 1) * sides + j) * 3, b = ((i - 1) * sides + (j + 1) % sides) * 3;
            const c = (i * sides + j) * 3, d = (i * sides + (j + 1) % sides) * 3;
            this.triangle(rings[a], rings[a + 1], rings[a + 2], rings[b], rings[b + 1], rings[b + 2], rings[c], rings[c + 1], rings[c + 2], color);
            this.triangle(rings[b], rings[b + 1], rings[b + 2], rings[d], rings[d + 1], rings[d + 2], rings[c], rings[c + 1], rings[c + 2], color);
        }
        for (let end = 0; end < 2; end++) {
            const i = end === 0 ? 0 : s.count - 1;
            for (let j = 0; j < sides; j++) {
                const a = (i * sides + j) * 3, b = (i * sides + (j + 1) % sides) * 3;
                if (end === 0) this.triangle(p[i * 3], p[i * 3 + 1], p[i * 3 + 2], rings[b], rings[b + 1], rings[b + 2], rings[a], rings[a + 1], rings[a + 2], color);
                else this.triangle(p[i * 3], p[i * 3 + 1], p[i * 3 + 2], rings[a], rings[a + 1], rings[a + 2], rings[b], rings[b + 1], rings[b + 2], color);
            }
        }
    }
}
