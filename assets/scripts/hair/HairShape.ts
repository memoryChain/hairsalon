import { CONFIG } from '../core/PrototypeConfig';
import { Strand } from './HairPresets';

export function fillStrandRings(s: Strand, rings: Float64Array): void {
    const sides = CONFIG.radialSides, p = s.p;
        for (let i = 0; i < s.count; i++) {
            const a = Math.max(0, i - 1) * 3, b = Math.min(s.count - 1, i + 1) * 3;
            let tx = p[b] - p[a], ty = p[b + 1] - p[a + 1], tz = p[b + 2] - p[a + 2];
            const length = Math.hypot(tx, ty, tz) || 1; tx /= length; ty /= length; tz /= length;
            let ux = ty, uy = -tx, uz = 0;
            if (Math.hypot(ux, uy) < 0.15) { ux = 0; uy = tz; uz = -ty; }
            const ul = Math.hypot(ux, uy, uz) || 1; ux /= ul; uy /= ul; uz /= ul;
            const vx = ty * uz - tz * uy, vy = tz * ux - tx * uz, vz = tx * uy - ty * ux;
            for (let j = 0; j < sides; j++) {
                const angle = j / sides * Math.PI * 2, k = (i * sides + j) * 3;
                const u = Math.cos(angle) * s.radius[i], v = Math.sin(angle) * s.radius[i] * (s.style === 'long' ? 0.65 : 1);
                rings[k] = p[i * 3] + ux * u + vx * v;
                rings[k + 1] = p[i * 3 + 1] + uy * u + vy * v;
                rings[k + 2] = p[i * 3 + 2] + uz * u + vz * v;
            }
        }
}
