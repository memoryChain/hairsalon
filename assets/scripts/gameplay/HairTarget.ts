import { SurfaceHairSimulation } from '../surface/SurfaceHairSimulation';
import { PlaneHairCutter } from '../surface/PlaneHairCutter';
import { SalonOrder } from './SalonOrders';

/** 目标从初始网格真实剪切而来，各发缕根面留在保留侧。 */
export function applyOrderTarget(sim: SurfaceHairSimulation,order: SalonOrder, selectedGroups?: ReadonlySet<number>): number {
    const c=sim.topology.asset.center,cutter=new PlaneHairCutter();let changes=0;
    // 低位后颈根不能用高于发根的统一平面剪，否则会留下整缕长发。
    const rows=new Map<number,Set<number>>();
    for(const f of sim.fiberRig.fibers) {
        if(selectedGroups&&!selectedGroups.has(f.group))continue;
        const minY=Math.min(...f.ids.map(id=>sim.topology.roots[id*3+1]));
        const y=Math.floor(Math.min(c[1]+order.bottom,minY-.035)*20)/20;
        if(!rows.has(y))rows.set(y,new Set());rows.get(y)!.add(f.group);
    }
    for(const [y,groups] of rows)if(cutter.clip(sim,{x:0,y:-1,z:0,d:y},undefined,groups).changed)changes++;
    const planes=[{x:1,y:0,z:0,d:-c[0]-order.side},{x:-1,y:0,z:0,d:c[0]-order.side}];
    for(const plane of planes) {
        const limits=new Map<number,Set<number>>();
        for(const f of sim.fiberRig.fibers) {
        if(selectedGroups&&!selectedGroups.has(f.group))continue;
            const rootEdge=Math.max(...f.ids.map(id=>plane.x*sim.topology.roots[id*3]));
            const limit=Math.ceil(Math.max(-plane.d,rootEdge+.035)*20)/20;
            if(!limits.has(limit))limits.set(limit,new Set());limits.get(limit)!.add(f.group);
        }
        for(const [limit,groups] of limits)if(cutter.clip(sim,{...plane,d:-limit},undefined,groups).changed)changes++;
    }
    if(order.top!==undefined||order.rootHeight!==undefined) {
        const heights=new Map<number,Set<number>>();
        for(const f of sim.fiberRig.fibers) {
        if(selectedGroups&&!selectedGroups.has(f.group))continue;
            const rootTop=Math.max(...f.ids.map(id=>sim.topology.roots[id*3+1]));
            // 鬃毛/头顶毛团：中央保留高度，外侧贴着各自发根修短。
            const outsideCrest=order.crestHalfWidth!==undefined&&Math.abs(f.root[0]-c[0])>order.crestHalfWidth;
            const desired=outsideCrest?rootTop+.055:order.rootHeight!==undefined?rootTop+order.rootHeight:c[1]+order.top!;
            const y=Math.ceil(Math.max(desired,rootTop+.035)*20)/20;
            if(!heights.has(y))heights.set(y,new Set());heights.get(y)!.add(f.group);
        }
        for(const [y,groups] of heights)if(cutter.clip(sim,{x:0,y:1,z:0,d:-y},undefined,groups).changed)changes++;
    }
    sim.debris.length=0;sim.clearVelocity();return changes;
}
