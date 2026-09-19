import type { HairStyle } from '../core/HairstyleCatalog';
import { HeadAsset, ScalpTopology } from './ScalpTopology';
import type { HeadRaycast } from './HeadRaycast';
// 额中、额角、耳前短鬓、后颈；刘海长度由造型曲线单独控制。
const PROFILES: Record<HairStyle, readonly number[]> = {
    afro: [1.03,1.05,1.54,1.93], mane: [1.02,1.05,1.56,1.95],
    waves: [1.04,1.06,1.56,1.96], curtains: [1.01,1.06,1.56,1.96],
    doublecover: [.95,.87,1.49,1.91], backcover: [.95,.87,1.49,1.91], crownlong: [1.01,.97,1.50,1.93],
    receding: [.78, .65, 1.50, 1.89], crown: [1.01, .97, 1.50, 1.89],
    horseshoe: [.92, .83, 1.48, 1.90], combover: [.95, .87, 1.49, 1.91], bald: [.98, .93, 1.47, 1.88],
    spiky: [1.08, 1.04, 1.54, 1.91], long: [1.04, 1.07, 1.57, 1.96],
    crop: [1.03, 1.00, 1.48, 1.86], mohawk: [.99, .96, 1.44, 1.87],
    quiff: [1.00, .94, 1.49, 1.88], sidepart: [1.03, 1.00, 1.51, 1.90],
    bob: [1.05, 1.08, 1.56, 1.92], lob: [1.03, 1.06, 1.56, 1.96],
    asymmetric: [1.04, 1.04, 1.52, 1.90], flipped: [1.04, 1.07, 1.55, 1.93],
};
const ANGLES = [0, .45, .85, 1.10, 1.35, 1.57, 1.95, 2.4, Math.PI];
export function hairlineAngle(style: HairStyle, azimuth: number): number {
    const p = PROFILES[style], a = Math.abs(azimuth), values = [p[0], (p[0] + p[1]) * .5, p[1], 1.21, p[2], 1.43, 1.66, p[3] - .08, p[3]];
    for (let i = 1; i < ANGLES.length; i++) if (a <= ANGLES[i]) {
        const t = (a - ANGLES[i - 1]) / (ANGLES[i] - ANGLES[i - 1]), w = t * t * (3 - 2 * t);
        return values[i - 1] * (1 - w) + values[i] * w;
    }
    return p[3];
}
/** 保持原根域拓扑，把新的发际线投影到真实头模三角面并记录重心绑定。 */
export function createHairlineAsset(base: ScalpTopology, raycast: HeadRaycast, style: HairStyle): HeadAsset {
    const asset = base.asset, center = asset.center, r = base.roots, boundary = new Set<number>();
    for (const edge of base.edges) if (edge.faces.length === 1) { boundary.add(edge.a); boundary.add(edge.b); }
    const direction = (id: number) => {
        const x = (r[id * 3] - center[0]) / .57, y = (r[id * 3 + 1] - center[1]) / .73, z = (r[id * 3 + 2] - center[2]) / .54;
        return { az: (Math.atan2(x, z) + Math.PI * 2) % (Math.PI * 2), theta: Math.atan2(Math.hypot(x, z), y) };
    };
    const edgeAngles = Array.from(boundary).map(direction).sort((a, b) => a.az - b.az);
    const positions: number[] = [], normals: number[] = [], bindings: number[] = [];
    const ray = { ox: center[0], oy: center[1], oz: center[2], dx: 0, dy: 0, dz: 0 };
    const hit = { x: 0, y: 0, z: 0, nx: 0, ny: 0, nz: 0, face: 0, u: 0, v: 0 };
    for (let id = 0; id < base.count; id++) {
        const d = direction(id);
        let hi = edgeAngles.findIndex(v => v.az > d.az); if (hi < 0) hi = 0;
        const lo = (hi + edgeAngles.length - 1) % edgeAngles.length, left = edgeAngles[lo], right = edgeAngles[hi];
        const width = (right.az - left.az + Math.PI * 2) % (Math.PI * 2), t = ((d.az - left.az + Math.PI * 2) % (Math.PI * 2)) / width;
        const original = left.theta * (1 - t) + right.theta * t;
        const az = d.az > Math.PI ? d.az - Math.PI * 2 : d.az, theta = d.theta / original * hairlineAngle(style, az);
        const x = .57 * Math.sin(theta) * Math.sin(az), y = .73 * Math.cos(theta), z = .54 * Math.sin(theta) * Math.cos(az), length = Math.hypot(x, y, z);
        ray.dx = x / length; ray.dy = y / length; ray.dz = z / length;
        if (!raycast.localSurface(ray, hit)) throw new Error('发际线无法贴合头模');
        positions.push(hit.x, hit.y, hit.z); normals.push(hit.nx, hit.ny, hit.nz); bindings.push(hit.face, 1 - hit.u - hit.v, hit.u, hit.v);
    }
    return { ...asset, scalpPositions: positions, scalpNormals: normals, scalpSurfaceBindings: bindings };
}
