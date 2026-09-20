export interface CutTrailSegment { x0:number;y0:number;x1:number;y1:number;scale:number;age:number; }
/** 屏幕刀光，不参与拾取或剪切。固定容量复用，松手后短暂保留再淡出。 */
export class CutTrail {
    readonly lifetime=.24;
    readonly segments:CutTrailSegment[]=Array.from({length:48},()=>({x0:0,y0:0,x1:0,y1:0,scale:1,age:1}));
    readonly path=new Float64Array(49*2);
    pointCount=0;
    opacity=0;
    pathScale=1;
    revision=0;
    private next=0;
    /** 按时间顺序接成一条路径，环形缓存回绕时也不产生跳线。 */
    preparePath():void {
        this.pointCount=0;this.opacity=0;
        for(let i=0;i<this.segments.length;i++){
            const s=this.segments[(this.next+i)%this.segments.length];if(s.age>=this.lifetime)continue;
            if(this.pointCount===0){this.path[0]=s.x0;this.path[1]=s.y0;this.pointCount=1;}
            this.path[this.pointCount*2]=s.x1;this.path[this.pointCount*2+1]=s.y1;this.pointCount++;
            this.opacity=1-s.age/this.lifetime;this.pathScale=s.scale;
        }
    }
    add(x0:number,y0:number,x1:number,y1:number,scale:number):void {
        if(!Number.isFinite(x0+y0+x1+y1)||Math.hypot(x1-x0,y1-y0)<.5)return;
        const s=this.segments[this.next];this.next=(this.next+1)%this.segments.length;
        s.x0=x0;s.y0=y0;s.x1=x1;s.y1=y1;s.scale=scale;s.age=0;this.revision++;
    }
    update(dt:number):void {
        if(!Number.isFinite(dt)||dt<=0)return;
        let dirty=false;
        for(const s of this.segments)if(s.age<this.lifetime){s.age+=dt;dirty=true;}
        if(dirty)this.revision++;
    }
    clear():void {
        let dirty=false;for(const s of this.segments)if(s.age<this.lifetime){s.age=this.lifetime;dirty=true;}
        if(dirty)this.revision++;
    }
}
