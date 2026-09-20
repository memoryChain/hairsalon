/** Canvas 表现刀光和卷动气流，路径和生命周期来自共享逻辑。 */
export function createCutTrail(trail,wind,parent){
    const canvas=document.createElement('canvas');canvas.className='cut-trail';canvas.setAttribute('aria-hidden','true');
    Object.assign(canvas.style,{position:'absolute',inset:'0',pointerEvents:'none',width:'100%',height:'100%'});
    parent.append(canvas);const ctx=canvas.getContext('2d');let revision=-1,windRevision=-1,rect=parent.getBoundingClientRect();
    new ResizeObserver(()=>{rect=parent.getBoundingClientRect();const dpr=Math.min(devicePixelRatio,2);canvas.width=Math.round(rect.width*dpr);canvas.height=Math.round(rect.height*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);trail.clear();wind.clear();revision=-1;}).observe(parent);
    return {update(){
        if(revision===trail.revision&&windRevision===wind.revision)return;
        revision=trail.revision;windRevision=wind.revision;ctx.clearRect(0,0,rect.width,rect.height);
        ctx.lineCap='round';ctx.lineJoin='round';
        for(const s of wind.lines){
            if(s.alpha<=0)continue;
            const p=s.path,count=p.length/2;
            for(let layer=0;layer<2;layer++){
                ctx.strokeStyle=layer===0?`rgba(94,184,215,${.275*s.alpha})`:`rgba(244,254,255,${.804*s.alpha})`;
                ctx.lineWidth=(layer===0?6:2)*s.scale;
                ctx.beginPath();ctx.moveTo(p[0]-rect.left,p[1]-rect.top);
                for(let i=1;i<count-1;i++){const k=i*2;ctx.quadraticCurveTo(p[k]-rect.left,p[k+1]-rect.top,(p[k]+p[k+2])*.5-rect.left,(p[k+1]+p[k+3])*.5-rect.top);}
                ctx.lineTo(p[(count-1)*2]-rect.left,p[(count-1)*2+1]-rect.top);ctx.stroke();
            }
        }
        trail.preparePath();const p=trail.path,count=trail.pointCount;if(count<2)return;
        ctx.lineJoin='round';
        for(let layer=0;layer<2;layer++){
            ctx.lineWidth=(layer===0?8:2.5)*trail.pathScale;
            ctx.strokeStyle=layer===0?`rgba(112,220,255,${.4*trail.opacity})`:`rgba(255,255,255,${.94*trail.opacity})`;
            ctx.beginPath();ctx.moveTo(p[0]-rect.left,p[1]-rect.top);
            for(let i=1;i<count-1;i++){const k=i*2;ctx.quadraticCurveTo(p[k]-rect.left,p[k+1]-rect.top,(p[k]+p[k+2])*.5-rect.left,(p[k+1]+p[k+3])*.5-rect.top);}
            ctx.lineTo(p[(count-1)*2]-rect.left,p[(count-1)*2+1]-rect.top);ctx.stroke();
        }
    }};
}
