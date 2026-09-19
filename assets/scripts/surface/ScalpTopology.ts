export interface HeadAsset {
    id: string;
    name: string;
    center: number[];
    headPositions: number[];
    headIndices: number[];
    headNormals?: number[];
    facialDetail?: boolean;
    skinColor?: number[];
    characterMesh?: { positions: number[]; normals: number[]; indices: number[]; colors: number[]; uvs?: number[] };
    faceLayout?: { width: number; top: number; height: number; front: number };
    scalpPositions: number[];
    scalpNormals: number[];
    scalpIndices: number[];
    scalpHeadVertexIds: number[];
    scalpSurfaceBindings?: number[];
}
export interface HeadLibrary {
    version: number;
    models: HeadAsset[];
}
export interface ScalpEdge {
    a: number;
    b: number;
    faces: number[];
}
/** 以输入三角网格为覆盖域；不要求球形参数、统一顶点数量或 UV。 */
export class ScalpTopology {
    readonly roots: Float64Array;
    readonly normals: Float64Array;
    readonly triangles: Uint32Array;
    readonly edges: ScalpEdge[] = [];
    readonly neighbors: number[][];
    readonly area: Float64Array;
    readonly vertexArea: Float64Array;
    readonly count: number;
    readonly totalArea: number;
    constructor(readonly asset: HeadAsset) {
        if (!asset || asset.scalpPositions.length % 3 || asset.scalpIndices.length % 3)
            throw new Error('头皮数据格式无效');
        if (asset.headPositions.length % 3 || asset.headIndices.length % 3 || asset.center.length !== 3 || !asset.center.every(Number.isFinite) || !asset.headPositions.every(Number.isFinite) || asset.headIndices.some(i => !Number.isInteger(i) || i < 0 || i >= asset.headPositions.length / 3))
            throw new Error('头模网格无效');
        if (asset.headNormals && (asset.headNormals.length !== asset.headPositions.length || !asset.headNormals.every(Number.isFinite)))
            throw new Error('头模平滑法线无效');
        this.roots = new Float64Array(asset.scalpPositions);
        this.count = this.roots.length / 3;
        this.normals = new Float64Array(asset.scalpNormals);
        this.triangles = new Uint32Array(asset.scalpIndices);
        if (this.normals.length !== this.roots.length || asset.scalpHeadVertexIds.length !== this.count || this.count < 3)
            throw new Error('头皮绑定数量不匹配');
        this.neighbors = Array.from({ length: this.count }, () => []);
        this.area = new Float64Array(this.triangles.length / 3);
        this.vertexArea = new Float64Array(this.count);
        const map = new Map<string, ScalpEdge>(), faceKeys = new Set<string>(), used = new Set<number>();
        let total = 0;
        for (let i = 0; i < this.count; i++) {
            const k = i * 3, h = asset.scalpHeadVertexIds[i] * 3;
            if (!Number.isInteger(asset.scalpHeadVertexIds[i]) || h < 0 || h + 2 >= asset.headPositions.length)
                throw new Error('头皮绑定索引无效');
            const binding = asset.scalpSurfaceBindings;
            if (binding) {
                const at = i * 4, face = binding[at], wa = binding[at + 1], wb = binding[at + 2], wc = binding[at + 3];
                if (binding.length !== this.count * 4 || !Number.isInteger(face) || face < 0 || face * 3 + 2 >= asset.headIndices.length || ![wa, wb, wc].every(v => Number.isFinite(v) && v >= -1e-8) || Math.abs(wa + wb + wc - 1) > 1e-8)
                    throw new Error('头皮表面绑定无效');
                for (let a = 0; a < 3; a++) {
                    const value = asset.headPositions[asset.headIndices[face * 3] * 3 + a] * wa + asset.headPositions[asset.headIndices[face * 3 + 1] * 3 + a] * wb + asset.headPositions[asset.headIndices[face * 3 + 2] * 3 + a] * wc;
                    if (!Number.isFinite(this.roots[k + a]) || Math.abs(this.roots[k + a] - value) > 1e-5) throw new Error('头皮未贴合头模');
                }
            } else for (let a = 0; a < 3; a++)
                if (!Number.isFinite(this.roots[k + a]) || Math.abs(this.roots[k + a] - asset.headPositions[h + a]) > 1e-5)
                    throw new Error('头皮未贴合头模');
            const n = Math.hypot(this.normals[k], this.normals[k + 1], this.normals[k + 2]);
            if (!Number.isFinite(n) || n < .5)
                throw new Error('头皮法线无效');
            for (let a = 0; a < 3; a++)
                this.normals[k + a] /= n;
        }
        for (let f = 0; f < this.area.length; f++) {
            const ids = asset.scalpIndices.slice(f * 3, f * 3 + 3);
            if (ids.some(i => !Number.isInteger(i) || i < 0 || i >= this.count) || new Set(ids).size !== 3)
                throw new Error('头皮三角形索引无效');
            const key = [...ids].sort((a, b) => a - b).join(',');
            if (faceKeys.has(key))
                throw new Error('头皮存在重复面');
            faceKeys.add(key);
            const [a, b, c] = ids.map(i => i * 3), p = this.roots;
            const ux = p[b] - p[a], uy = p[b + 1] - p[a + 1], uz = p[b + 2] - p[a + 2], vx = p[c] - p[a], vy = p[c + 1] - p[a + 1], vz = p[c + 2] - p[a + 2];
            const area = Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx) * .5;
            if (area < 1e-10)
                throw new Error('头皮存在退化面');
            this.area[f] = area;
            total += area;
            for (let j = 0; j < 3; j++) {
                const a = ids[j], b = ids[(j + 1) % 3];
                used.add(a);
                this.vertexArea[a] += area / 3;
                const key = Math.min(a, b) + ',' + Math.max(a, b), edge = map.get(key);
                if (edge) {
                    if (edge.faces.length === 2 || edge.a === a)
                        throw new Error('头皮非流形或面朝向不一致');
                    edge.faces.push(f);
                }
                else
                    map.set(key, { a, b, faces: [f] });
                if (this.neighbors[a].indexOf(b) === -1)
                    this.neighbors[a].push(b);
                if (this.neighbors[b].indexOf(a) === -1)
                    this.neighbors[b].push(a);
            }
        }
        if (used.size !== this.count)
            throw new Error('头皮包含孤立顶点');
        this.edges.push(...map.values());
        this.totalArea = total;
        const seen = new Set<number>([0]), queue = [0];
        for (let q = 0; q < queue.length; q++)
            for (const i of this.neighbors[queue[q]])
                if (!seen.has(i)) {
                    seen.add(i);
                    queue.push(i);
                }
        if (seen.size !== this.count)
            throw new Error('首版需要单片连续头皮');
        const degree = new Uint8Array(this.count);
        for (const edge of this.edges)
            if (edge.faces.length === 1) {
                degree[edge.a]++;
                degree[edge.b]++;
            }
        if (this.count - this.edges.length + this.area.length !== 1 || degree.some(n => n !== 0 && n !== 2))
            throw new Error('首版头皮必须是无孔洞、边界连续的单片区域');
    }
}
