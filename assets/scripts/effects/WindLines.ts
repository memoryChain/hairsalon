export interface WindLine { x0:number;y0:number;x1:number;y1:number;alpha:number;scale:number;path:Float64Array; }
/** 气流沿风源到头部的路径推进，只在行程末端散开弯曲。 */
export class WindLines {
    readonly lines:WindLine[]=Array.from({length:5},()=>({x0:0,y0:0,x1:0,y1:0,alpha:0,scale:1,path:new Float64Array(37*2)}));
    revision=0;
    private x=0;private y=0;private tx=0;private ty=0;private scale=1;
    private age=1;private time=0;
    private readonly lifetime=.35;
    pulse(x:number,y:number,tx:number,ty:number,scale:number):void {
        if(!Number.isFinite(x+y+tx+ty+scale)||scale<=0||Math.hypot(tx-x,ty-y)<1e-4){this.clear();return;}
        this.x=x;this.y=y;this.tx=tx;this.ty=ty;this.scale=scale;this.age=0;this.rebuild();
    }
    update(dt:number):void {
        if(!Number.isFinite(dt)||dt<=0||this.age>=this.lifetime)return;
        this.age+=dt;this.time+=dt;
        if(this.age>=this.lifetime)this.clear();else this.rebuild();
    }
    private rebuild():void {
        const dx=this.tx-this.x,dy=this.ty-this.y,length=Math.hypot(dx,dy),ux=dx/length,uy=dy/length,nx=-uy,ny=ux;
        const spread=Math.min(54*this.scale,length*.22),fade=1-this.age/this.lifetime;
        for(let i=0;i<this.lines.length;i++){
            const lane=(i-2)/2,phase=(this.time*1.25+i*.19+.2)%1;
            const end=.16+phase*.88,start=Math.max(0,end-.7);
            const bendSize=Math.min(26*this.scale,length*.1)*lane;
            const line=this.lines[i],p=line.path;
            for(let j=0;j<37;j++){
                const u=start+(end-start)*j/36;
                // 弯曲位置固定在靠近头部的最后一段，不随每条短线的前端移动。
                const bend=Math.max(0,(u-.78)/.26);
                const along=length*u,across=lane*spread*(.25+.55*u)+bendSize*bend*bend;
                p[j*2]=this.x+ux*along+nx*across;p[j*2+1]=this.y+uy*along+ny*across;
            }
            line.x0=p[0];line.y0=p[1];line.x1=p[72];line.y1=p[73];
            line.alpha=Math.min(1,phase/.12,(1-phase)/.2)*fade;line.scale=this.scale;
        }
        this.revision++;
    }
    clear():void {
        let dirty=false;for(const line of this.lines)if(line.alpha!==0){line.alpha=0;dirty=true;}
        this.age=this.lifetime;if(dirty)this.revision++;
    }
}
