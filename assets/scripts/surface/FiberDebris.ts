import type { SurfaceHairSimulation } from './SurfaceHairSimulation';
/** 一批网格容纳许多独立发缕，按整缕裁减显示预算，不增添刚体或节点。 */
export function addFiberDebris(sim: SurfaceHairSimulation, p: ArrayLike<number>, previous: ArrayLike<number>, indices: number[], groups: number[]): number {
    const byGroup = new Map<number, number[]>();
    for (let f = 0; f < indices.length; f += 3) {
        const group = groups[f / 3] || 0;
        if (!byGroup.has(group))
            byGroup.set(group, []);
        byGroup.get(group)!.push(f);
    }
    const faces: number[] = [];
    let vertices = 0, discardedVolume = 0;
    for (const entries of byGroup.values())
        if (vertices + entries.length * 3 <= 16000) {
            faces.push(...entries);
            vertices += entries.length * 3;
        }
        else
            for (const f of entries) {
                const a = indices[f] * 3, b = indices[f + 1] * 3, c = indices[f + 2] * 3;
                discardedVolume += (p[a] * (p[b + 1] * p[c + 2] - p[b + 2] * p[c + 1]) + p[a + 1] * (p[b + 2] * p[c] - p[b] * p[c + 2]) + p[a + 2] * (p[b] * p[c + 1] - p[b + 1] * p[c])) / 6;
            }
    if (!vertices)
        return discardedVolume;
    const points = new Float64Array(vertices * 3), velocities = new Float64Array(vertices * 3), ids = new Uint16Array(faces.length), forces = new Float32Array(faces.length * 3);
    for (let j = 0; j < faces.length; j++) {
        const f = faces[j], group = groups[f / 3] || 0;
        ids[j] = group;
        const phase = group * 2.3999632297;
        forces[j * 3] = Math.cos(phase) * 1.7;
        forces[j * 3 + 1] = Math.sin(phase * .7) * .35;
        forces[j * 3 + 2] = Math.sin(phase) * 1.7;
        for (let v = 0; v < 3; v++)
            for (let axis = 0; axis < 3; axis++) {
                const to = j * 9 + v * 3 + axis, from = indices[f + v] * 3 + axis;
                points[to] = p[from];
                velocities[to] = previous[from];
            }
    }
    while (sim.debris.length && (sim.debris.length >= 12 || sim.debris.reduce((n, d) => n + d.p.length / 3, 0) + vertices > 16000))
        sim.debris.shift();
    sim.debris.push({ p: points, previous: velocities, age: 0, style: sim.style, groups: ids, forces });
    return discardedVolume;
}
