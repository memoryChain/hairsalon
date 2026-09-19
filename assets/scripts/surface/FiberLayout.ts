import { growsHair } from './HairGrowthMask';
import { FiberRig } from './FiberRig';
import { BoundHairMesh, Binding } from './BoundHairMesh';
import type { SurfaceHairSimulation } from './SurfaceHairSimulation';
export interface RootCell {
    faces: number[];
    boundary: number[];
}
/** 相邻三角形配成小区；根面逐面归属，不叠加发帽或用重叠发簇补洞。 */
export function partitionRoots(sim: SurfaceHairSimulation): RootCell[] {
    const t = sim.topology, ix = t.triangles, r = t.roots, used = new Uint8Array(ix.length / 3), neighbors: number[][] = Array.from({ length: ix.length / 3 }, () => []);
    for (const e of t.edges)
        if (e.faces.length === 2) {
            neighbors[e.faces[0]].push(e.faces[1]);
            neighbors[e.faces[1]].push(e.faces[0]);
        }
    const cells: RootCell[] = [];
    for (let f = 0; f < used.length; f++)
        if (!used[f]) {
            const a = Array.from(ix.slice(f * 3, f * 3 + 3));
            let partner = -1, score = -Infinity;
            for (const other of neighbors[f])
                if (!used[other]) {
                    const b = Array.from(ix.slice(other * 3, other * 3 + 3)), shared = a.filter(v => b.indexOf(v) >= 0);
                    if (shared.length !== 2)
                        continue;
                    const u = shared[0] * 3, v = shared[1] * 3, length = Math.hypot(r[u] - r[v], r[u + 1] - r[v + 1], r[u + 2] - r[v + 2]);
                    // 优先合并原网格较长的对角边，减少狭长小区。
                    if (length > score) {
                        score = length;
                        partner = other;
                    }
                }
            const faces = partner < 0 ? [f] : [f, partner], edges: [
                number,
                number
            ][] = [];
            for (const face of faces)
                for (let j = 0; j < 3; j++)
                    edges.push([ix[face * 3 + j], ix[face * 3 + (j + 1) % 3]]);
            const border = edges.filter(([a, b]) => !edges.some(([u, v]) => u === b && v === a)), boundary = [border[0][0]];
            while (boundary.length < border.length) {
                const edge = border.find(e => e[0] === boundary[boundary.length - 1]);
                if (!edge)
                    throw new Error('根域边界不连续');
                boundary.push(edge[1]);
            }
            used[f] = 1;
            if (partner >= 0)
                used[partner] = 1;
            cells.push({ faces, boundary });
        }
    const center = t.asset.center;
    const growing = cells.filter(cell => {
        let x=0,y=0,z=0;
        for(const id of cell.boundary){x+=r[id*3]-center[0];y+=r[id*3+1]-center[1];z+=r[id*3+2]-center[2];}
        const n=cell.boundary.length;
        return growsHair(sim.style,x/n,y/n,z/n);
    });
    return groomCells(sim, growing);
}
/** 合并相邻根区形成有主次的束；拒绝洞、内点和跨造型区合并，根面仍唯一归属。 */
function groomCells(sim: SurfaceHairSimulation, cells: RootCell[]): RootCell[] {
    const r=sim.topology.roots, ix=sim.topology.triangles, center=sim.topology.asset.center;
    const peaks=[[-.50,.84,.04],[.02,.999,-.04],[.59,.80,-.05],[-.82,.55,-.10],[.85,.48,-.15],[-.35,.70,-.63],[.43,.64,-.63]];
    const zone=(cell: RootCell): number => {
        let x=0,y=0,z=0;
        for(const id of cell.boundary){x+=r[id*3]-center[0];y+=r[id*3+1]-center[1];z+=r[id*3+2]-center[2];}
        x/=cell.boundary.length; y/=cell.boundary.length; z/=cell.boundary.length;
        if(sim.style==='bob')return Math.floor((Math.atan2(x,z)+Math.PI)/(.52))+(y>.43?20:0);
        if(sim.style !== 'spiky') {
            const az = Math.atan2(x,z), tier = y > .43 ? 40 : 0;
            if(sim.style === 'mohawk') return Math.abs(x)<.19 ? 100+Math.floor((z+.6)/.24) : (x<0?0:20)+tier+Math.floor((az+Math.PI)/.65);
            if(sim.style === 'sidepart') return (x<-.14?0:20)+tier+Math.floor((az+Math.PI)/.60);
            return Math.floor((az+Math.PI)/.52)+tier+(z>.18&&Math.abs(az)<.82?100:0);
        }
        const n=Math.hypot(x/.57,y/.73,z/.54);x=x/.57/n;y=y/.73/n;z=z/.54/n;
        let best=0,d=Infinity;for(let i=0;i<peaks.length;i++){const p=peaks[i],q=(x-p[0])**2+(y-p[1])**2+(z-p[2])**2;if(q<d){d=q;best=i;}}
        return best+(y<.15?10:0);
    };
    const zones=cells.map(zone), used=new Uint8Array(cells.length), result: RootCell[]=[];
    for(let seed=0;seed<cells.length;seed++)if(!used[seed]){
        let cell={faces:cells[seed].faces.slice(),boundary:cells[seed].boundary.slice()};used[seed]=1;
        const limit=sim.style==='spiky'?(seed%5===0?4:seed%3===0?6:10):sim.style==='bob'?(seed%4===0?4:8):sim.style==='crop'?(seed%3===0?4:6):(seed%5===0?4:seed%3===0?6:8);
        while(cell.faces.length<limit){
            let found=false;
            for(let j=0;j<cells.length;j++)if(!used[j]&&zones[j]===zones[seed]){
                const shared=cells[j].boundary.filter(id=>cell.boundary.indexOf(id)>=0);if(shared.length!==2)continue;
                const faces=cell.faces.concat(cells[j].faces), edges: number[][]=[], vertices=new Set<number>();
                for(const f of faces)for(let k=0;k<3;k++){const a=ix[f*3+k],b=ix[f*3+(k+1)%3];edges.push([a,b]);vertices.add(a);}
                const border=edges.filter(([a,b])=>!edges.some(([u,v])=>u===b&&v===a));
                if(border.length!==vertices.size)continue;
                const boundary=[border[0][0]];
                while(boundary.length<border.length){const next=border.find(([a])=>a===boundary[boundary.length-1]);if(!next||boundary.indexOf(next[1])>=0)break;boundary.push(next[1]);}
                if(boundary.length!==border.length||!border.some(([a,b])=>a===boundary[boundary.length-1]&&b===boundary[0]))continue;
                cell={faces,boundary};used[j]=1;found=true;break;
            }
            if(!found)break;
        }
        result.push(cell);
    }
    return result;
}
export function buildFibers(sim: SurfaceHairSimulation): BoundHairMesh {
    const cells = partitionRoots(sim), bindings: Binding[] = [], indices: number[] = [], caps: boolean[] = [], groups: number[] = [], ix = sim.topology.triangles;
    sim.fiberRig = new FiberRig(sim, cells);
    const levels = sim.fiberRig.levels;
    for (let group = 0; group < cells.length; group++) {
        const cell = cells[group], ids = cell.boundary, sides = ids.length, base = bindings.length;
        for (let ring = 0; ring < levels.length; ring++)
            for (let corner = 0; corner < sides; corner++) {
                const weights = ids.map((_, j) => j === corner ? 1 : 0);
                bindings.push({ guides: ids.slice(), levels: ids.map(() => levels[ring]), weights, samples: [bindings.length], sampleWeights: [1] });
            }
        const tri = (a: number, b: number, c: number) => { indices.push(a, b, c); caps.push(false); groups.push(group); };
        for (const face of cell.faces)
            tri(base + ids.indexOf(ix[face * 3 + 2]), base + ids.indexOf(ix[face * 3 + 1]), base + ids.indexOf(ix[face * 3]));
        for (let ring = 0; ring < levels.length - 1; ring++)
            for (let j = 0; j < sides; j++) {
                const a = base + ring * sides + j, b = base + ring * sides + (j + 1) % sides, c = a + sides, d = b + sides;
                tri(a, b, c);
                tri(b, d, c);
            }
        const tip = base + (levels.length - 1) * sides;
        for(const face of cell.faces)tri(tip+ids.indexOf(ix[face*3]),tip+ids.indexOf(ix[face*3+1]),tip+ids.indexOf(ix[face*3+2]));
    }
    return new BoundHairMesh(bindings, indices, caps, groups);
}
