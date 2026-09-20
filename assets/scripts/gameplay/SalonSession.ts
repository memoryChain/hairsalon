import { FaceEmotion } from '../character/FaceExpressionController';
import { SurfaceHairSimulation } from '../surface/SurfaceHairSimulation';
import { applyOrderTarget } from './HairTarget';
export { applyOrderTarget } from './HairTarget';
import { HeadAsset } from '../surface/ScalpTopology';
import { captureHair, HairSnapshot, HairScore, Raster, renderHairView, scoreHair, regionalHairFeatures } from './HairScore';
import { InitialLook, getInitialLooks, applyInitialLook } from './InitialLooks';
import { resultPortrait } from './ResultPortrait';
import { comicBounds, ComicBounds } from './ComicFraming';
import { SALON_ORDERS, SalonOrder } from './SalonOrders';
export { SALON_ORDERS } from './SalonOrders';
export type { SalonOrder } from './SalonOrders';

export type SalonPhase = 'arrival' | 'request' | 'ready' | 'styling' | 'settling' | 'result';
/** 独立于引擎的流程；只在阶段改变或完成剪切时更新 UI 与评价。 */
export class SalonSession {
    phase: SalonPhase='arrival'; order!: SalonOrder; customer=0; emotion: FaceEmotion='neutral';
    result: HairScore|null=null; target!: HairSnapshot; targetViews: Raster[]=[];
    comicBounds!:ComicBounds; revision=0;
    private resultSnapshot: HairSnapshot|null=null;
    initialLook!:InitialLook;
    private readonly previousLooks=new Map<string,string>();
    private readonly resultPortraits=new Map<number,Raster>();
    private lastOrder=-1;private cuts=0;private moodTime=0;private settleTime=0;private pendingCut=false;
    private remainingOrders: number[]=[];
    private readonly cache=new Map<string,{target:HairSnapshot;views:Raster[]}>();
    constructor(readonly sim: SurfaceHairSimulation,private readonly head: HeadAsset,private readonly random:()=>number=Math.random) { this.nextCustomer(); }
    get canStyle(): boolean { return this.phase==='styling'; }
    getResultPortrait(view: number): Raster {
        if(!this.resultSnapshot)throw new Error('结算作品尚未生成');
        view=((Math.round(view)%4)+4)%4;
        let image=this.resultPortraits.get(view);
        if(!image){image=resultPortrait(this.resultSnapshot,this.head,view,this.emotion);this.resultPortraits.set(view,image);}
        return image;
    }
    nextCustomer(): boolean {
        if(this.customer>0&&this.phase!=='result')return false;
        const pick=()=>Math.max(0,Math.min(.999999,this.random()));
        if(!this.remainingOrders.length)this.remainingOrders=SALON_ORDERS.map((_,i)=>i);
        // 一轮不重复，跨轮也不紧接着遇到同一位。
        const candidates=this.remainingOrders.filter(i=>i!==this.lastOrder);
        const index=candidates[Math.floor(pick()*candidates.length)];
        this.remainingOrders.splice(this.remainingOrders.indexOf(index),1);
        this.lastOrder=index;this.order=SALON_ORDERS[index];this.customer++;
        this.sim.paused=false;this.sim.debugScalp=false;
        let cached=this.cache.get(this.order.id);
        if(!cached) {
            const model=new SurfaceHairSimulation(this.head);model.reset(this.order.style);applyOrderTarget(model,this.order);
            const target=captureHair(model);
            cached={target,views:[0,1,2,3].map(v=>renderHairView(target,this.head,v))};
            if(this.cache.size>=3)this.cache.delete(this.cache.keys().next().value!);
            this.cache.set(this.order.id,cached);
        }
        this.target=cached.target;this.targetViews=cached.views;
        const looks=getInitialLooks(this.order),lastLook=this.previousLooks.get(this.order.id);
        const choices=looks.filter(look=>look.id!==lastLook);
        this.initialLook=choices[Math.floor(pick()*choices.length)];
        this.previousLooks.set(this.order.id,this.initialLook.id);
        this.resetInitial();
        this.comicBounds=comicBounds(this.head.characterMesh?.positions??this.head.headPositions,this.sim.fiberMesh.evaluate(this.sim));
        this.result=null;this.resultSnapshot=null;this.resultPortraits.clear();this.cuts=0;this.pendingCut=false;this.emotion='neutral';this.moodTime=0;this.phase='arrival';this.revision++;return true;
    }
    advanceComic(): void {
        if(this.phase==='arrival')this.phase='request';else if(this.phase==='request')this.phase='ready';else if(this.phase==='ready')this.phase='styling';else return;
        this.revision++;
    }
    finish(): boolean {
        if(!this.canStyle)return false;
        this.phase='settling';this.sim.debugScalp=false;this.sim.stop();this.settleTime=0;this.revision++;return true;
    }
    retry(): boolean {
        if(this.phase!=='result')return false;
        this.sim.paused=false;this.resetInitial();
        this.result=null;this.resultSnapshot=null;this.resultPortraits.clear();this.cuts=0;this.pendingCut=false;this.emotion='neutral';this.moodTime=0;this.phase='styling';this.revision++;return true;
    }
    private resetInitial():void {
        applyInitialLook(this.sim,this.initialLook);
    }
    update(dt: number,action: string): void {
        if(!Number.isFinite(dt)||dt<=0)return;
        dt=Math.min(dt,.1);this.moodTime=Math.max(0,this.moodTime-dt);
        if(this.phase==='settling') {
            this.settleTime+=dt;
            if(this.settleTime>=.6) {
                const actual=captureHair(this.sim);this.result=scoreHair(actual,this.target,this.head,this.targetViews);
                this.resultSnapshot=actual;this.resultPortraits.clear();
                this.emotion=this.result.total>=70?'happy':this.result.total>=45?'surprised':this.result.total>=25?'sad':'angry';this.phase='result';this.revision++;
            }
        } else if(this.canStyle) {
            if(this.sim.cuts!==this.cuts) { this.cuts=this.sim.cuts;this.pendingCut=true; }
            if(this.pendingCut&&this.moodTime===0) {
                this.pendingCut=false;
                const actual=regionalHairFeatures(captureHair(this.sim)),target=regionalHairFeatures(this.target);let missing=0,weight=0;
                for(let i=0;i<5;i++) {
                    const w=target.weights[i];weight+=w;
                    if(actual.lengths[i]<target.lengths[i]*.6)missing+=w;
                }
                this.emotion=missing>weight*.18?'sad':'surprised';this.moodTime=1.1;
            }
            else if(this.moodTime===0)this.emotion=action==='blow'?'surprised':action==='comb'?'happy':'neutral';
        }
    }
}
