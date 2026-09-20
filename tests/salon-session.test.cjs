const {test}=require('node:test');
const assert=require('node:assert/strict');
const {SurfaceHairSimulation}=require('../.cache/test-core/surface/SurfaceHairSimulation.js');
const {SALON_ORDERS,SalonSession,applyOrderTarget}=require('../.cache/test-core/gameplay/SalonSession.js');
const {captureHair,scoreHair}=require('../.cache/test-core/gameplay/HairScore.js');
const head=require('../assets/resources/scalp/user-head.json');
const {comicCamera,comicRenderSize}=require('../.cache/test-core/gameplay/ComicFraming.js');
const {resultFrame,resultPortrait}=require('../.cache/test-core/gameplay/ResultPortrait.js');

test('漫画实时画面双倍采样且保持纵横比，大屏纹理有上限',()=>{
    assert.deepEqual(comicRenderSize(568,436),{width:1136,height:872});
    for(const [width,height] of [[320,500],[568,436],[1600,1200],[3200,1800]]){
        const size=comicRenderSize(width,height);
        assert.ok(size.width<=1536&&size.height<=1536);
        assert.ok(Math.abs(size.width/size.height-width/height)<.003);
    }
    assert.deepEqual(comicRenderSize(0,NaN),{width:2,height:2});
});

test('结算抗锯齿按子像素覆盖混色，保留细线且不模糊相邻的纯色区域',()=>{
    const {newRaster}=require('../.cache/test-core/gameplay/HairScore');
    const {resolvePortraitSamples}=require('../.cache/test-core/gameplay/ResultPortrait');
    const source=newRaster(4);source.rgba.fill(255);
    // 一条只占最终像素 1/4 的细眉；无采样时可能完全丢失或变成粗黑块。
    source.rgba.set([0,0,0,255],0);source.depth[0]=.8;source.mask[0]=1;
    const out=resolvePortraitSamples(source);
    assert.equal(out.size,2);assert.deepEqual(Array.from(out.rgba.slice(0,4)),[191,191,191,255]);
    assert.deepEqual(Array.from(out.rgba.slice(4,8)),[255,255,255,255]);
    assert.ok(Number.isFinite(out.depth[0]));assert.equal(out.depth[1],-Infinity);
    assert.deepEqual(Array.from(source.rgba.slice(0,4)),[0,0,0,255]);
});

test('结算作品放大取景无裁边，切换角度不改变评分或模拟，重试清除作品',()=>{
    const sim=new SurfaceHairSimulation(head),session=new SalonSession(sim,head,()=>0);
    session.advanceComic();session.advanceComic();session.advanceComic();
    applyOrderTarget(sim,session.order);session.finish();for(let i=0;i<7;i++)session.update(.1,'idle');
    const result=session.result,p=sim.p.slice(),previous=sim.previous.slice();
    const front=session.getResultPortrait(0);assert.equal(front.size,512);
    let eyeWhite=0;for(let i=0;i<front.rgba.length;i+=4)if(front.rgba[i]===250&&front.rgba[i+1]===251&&front.rgba[i+2]===252)eyeWhite++;
    assert.ok(eyeWhite>10,'眼白保留实时五官纯色，不能因三角面法线产生灰块');
    assert.equal(session.getResultPortrait(0),front);
    const snapshot=captureHair(sim),headBottom=Math.min(...head.headPositions.filter((_,i)=>i%3===1));
    assert.equal(session.emotion,'happy');
    assert.deepEqual(front.rgba,resultPortrait(snapshot,head,0,'happy').rgba);
    assert.notDeepEqual(front.rgba,resultPortrait(snapshot,head,0,'neutral').rgba,'结算图必须显示评分表情');
    for(let view=0;view<4;view++){
        const raster=session.getResultPortrait(view),n=raster.size;let top=n,bottom=0,left=n,right=0;
        const frame=resultFrame(snapshot,head,view);let bodyPixels=0;
        for(let y=0;y<n;y++)for(let x=0;x<n;x++)if(Number.isFinite(raster.depth[y*n+x])){
            top=Math.min(top,y);bottom=Math.max(bottom,y);left=Math.min(left,x);right=Math.max(right,x);
            const worldY=head.center[1]+frame.offsetY+(n/2-y)*frame.span/n;
            if(worldY<headBottom-.1)bodyPixels++;
        }
        assert.ok(bodyPixels>1000,'四个角度必须实际画出头部以下的身体');
        assert.ok(Math.max(bottom-top,right-left)>n*.8);
        assert.ok(top>0&&left>0&&bottom<n-1&&right<n-1);
    }
    assert.equal(session.result,result);assert.equal(result.total,scoreHair(snapshot,session.target,head).total);
    assert.deepEqual(sim.p,p);assert.deepEqual(sim.previous,previous);
    session.retry();assert.throws(()=>session.getResultPortrait(0));
});

test('漫画镜头在横竖画格内包含完整角色与初始发型',()=>{
    const sim=new SurfaceHairSimulation(head),session=new SalonSession(sim,head,()=>0);
    const body=head.characterMesh.positions,hair=sim.fiberMesh.evaluate(sim),bounds=session.comicBounds;
    assert.equal(bounds.minY,Math.min(...body.filter((_,i)=>i%3===1),...hair.filter((_,i)=>i%3===1)));
    for(const aspect of [.55,1,2.5]){
        const camera=comicCamera(bounds,aspect,39),tangent=Math.tan(39*Math.PI/360);
        for(const positions of [body,hair])for(let i=0;i<positions.length;i+=3){
            const depth=camera.z-positions[i+2];assert.ok(depth>0);
            assert.ok(Math.abs((positions[i]-camera.x)/(depth*tangent*aspect))<1);
            assert.ok(Math.abs((positions[i+1]-camera.y)/(depth*tangent))<1);
        }
    }
});

test('全部明星和动物目标都由真实剪切生成；同一造型满分，原发型与全剃可区分',()=>{
    assert.equal(SALON_ORDERS.length,26);
    assert.equal(SALON_ORDERS.filter(o=>o.kind==='celebrity').length,20);
    assert.equal(SALON_ORDERS.filter(o=>o.kind==='animal').length,6);
    for(const order of SALON_ORDERS){
        const sim=new SurfaceHairSimulation(head);sim.reset(order.style);
        const initial=captureHair(sim),positions=sim.p.slice(),velocities=sim.previous.slice();
        assert.deepEqual(sim.p,positions);assert.deepEqual(sim.previous,velocities);
        assert.ok(applyOrderTarget(sim,order)>0,order.id);
        const target=captureHair(sim);assert.ok(target.indices.length>0);
        const same=scoreHair(target,target,head);assert.equal(same.total,100);assert.equal(same.stars,3);
        const before=scoreHair(initial,target,head);assert.ok(before.total<90,order.id);
        sim.lengths.fill(0);const bald=scoreHair(captureHair(sim),target,head);assert.ok(bald.total<=5,order.id);
        assert.ok(before.total>bald.total);
    }
});
test('马鬃目标实际收短外侧发缕、保留中央高度，动物目标不是只换照片',()=>{
    const order=SALON_ORDERS.find(o=>o.id==='animal-horse');
    const sim=new SurfaceHairSimulation(head);sim.reset(order.style);
    applyOrderTarget(sim,{...order,crestHalfWidth:undefined});const withoutCrest=captureHair(sim);
    sim.reset(order.style);applyOrderTarget(sim,order);const withCrest=captureHair(sim);
    let shorterSides=0;
    for(const f of sim.fiberRig.fibers){
        const k=f.group*3,a=Math.hypot(...withoutCrest.tips.slice(k,k+3)),b=Math.hypot(...withCrest.tips.slice(k,k+3));
        if(Math.abs(f.root[0]-head.center[0])>order.crestHalfWidth){if(a-b>.02)shorterSides++;}
        else assert.ok(Math.abs(a-b)<.001,'中央鬃毛不受侧边修短影响');
    }
    assert.ok(shorterSides>=2,'两侧必须有真实发缕缩短');
});
test('全部订单的本地照片与署名齐全，连续两轮不重样且初始发型随订单切换',()=>{
    const fs=require('node:fs'),path=require('node:path');
    const references=path.resolve(__dirname,'../assets/resources/references');
    const credits=JSON.parse(fs.readFileSync(path.join(references,'credits.json'),'utf8'));
    assert.equal(new Set(SALON_ORDERS.map(o=>o.id)).size,26);
    assert.ok(new Set(SALON_ORDERS.map(o=>o.style)).size>=10);
    for(const order of SALON_ORDERS){
        const photo=fs.readFileSync(path.join(references,order.id+'.jpg'));
        assert.equal(photo.readUInt16BE(0),0xffd8);
        assert.ok(fs.existsSync(path.join(references,order.id+'.jpg.meta')));
        assert.ok(credits.files.some(p=>p.file===order.id+'.jpg'&&p.subject===order.referenceName&&p.author&&p.source&&p.license));
        assert.ok(!order.credit.includes('PHOTO:'));
    }
    const sim=new SurfaceHairSimulation(head),session=new SalonSession(sim,head,()=>0);let previous='';
    for(let round=0;round<2;round++){
        const seen=new Set();
        for(let i=0;i<SALON_ORDERS.length;i++){
            const order=session.order;
            assert.ok(!seen.has(order.id));assert.notEqual(order.id,previous);seen.add(order.id);previous=order.id;
            assert.equal(sim.style,session.initialLook.style);assert.equal(sim.cuts,0);assert.equal(session.phase,'arrival');
            assert.ok(session.cache.size<=3,'增加顾客数量不能无限缓存评分网格');
            session.advanceComic();session.advanceComic();session.advanceComic();session.finish();
            for(let j=0;j<7;j++)session.update(.1,'idle');
            assert.equal(session.phase,'result');
            if(i===7){const initial=captureHair(sim);session.retry();assert.equal(session.order,order);assert.deepEqual(captureHair(sim),initial);session.finish();for(let j=0;j<7;j++)session.update(.1,'idle');}
            session.nextCustomer();
        }
        assert.equal(seen.size,26);
    }
});
test('评分与转向、俯仰、临时风场无关，读取不修改模拟状态',()=>{
    const sim=new SurfaceHairSimulation(head);sim.reset('bob');applyOrderTarget(sim,SALON_ORDERS[0]);
    const target=captureHair(sim);
    sim.dragTurn(1.1,.3);sim.fiberRig.wind.fill(.3);sim.fiberRig.previousWind.fill(-.1);
    const p=sim.p.slice(),previous=sim.previous.slice(),wind=sim.fiberRig.wind.slice(),yaw=sim.yaw,pitch=sim.pitch,cuts=sim.cuts;
    const actual=captureHair(sim);
    assert.equal(scoreHair(actual,target,head).total,100);
    assert.deepEqual(sim.p,p);assert.deepEqual(sim.previous,previous);assert.deepEqual(sim.fiberRig.wind,wind);
    assert.equal(sim.yaw,yaw);assert.equal(sim.pitch,pitch);assert.equal(sim.cuts,cuts);
});
test('真实斜切改变评分，即使原导向长度字段不变',()=>{
    const sim=new SurfaceHairSimulation(head);sim.reset('curtains');const lengths=sim.lengths.slice(),before=captureHair(sim);
    applyOrderTarget(sim,SALON_ORDERS[1]);const after=captureHair(sim);
    assert.deepEqual(sim.lengths,lengths);assert.notDeepEqual(before.indices,after.indices);
    assert.ok(scoreHair(before,after,head).total<90);
});
test('梳理定型会改变评分，临时风场不会抵消定型差异',()=>{
    const sim=new SurfaceHairSimulation(head);sim.reset('curtains');const target=captureHair(sim),out={x:0,y:0,z:0};
    for(const f of sim.fiberRig.fibers)if(f.root[0]>head.center[0])sim.fiberRig.comb(f.group,1,1,0,.7,sim,out);
    const styled=captureHair(sim),score=scoreHair(styled,target,head);assert.ok(score.total<95);assert.ok(score.direction<99);
    sim.fiberRig.wind.fill(.7);assert.equal(scoreHair(captureHair(sim),target,head).total,score.total);
});
test('严重剪短时难过，极低分结算生气，漫画期间工具不会改变情绪',()=>{
    const sim=new SurfaceHairSimulation(head),session=new SalonSession(sim,head,()=>0);
    session.update(.1,'comb');assert.equal(session.emotion,'neutral');
    session.advanceComic();session.advanceComic();session.advanceComic();session.update(.1,'comb');assert.equal(session.emotion,'happy');
    sim.lengths.fill(0);sim.cuts++;session.update(.1,'cut');assert.equal(session.emotion,'sad');
    session.finish();for(let i=0;i<7;i++)session.update(.1,'idle');assert.equal(session.result.total,0);assert.equal(session.emotion,'angry');
    const snapshot=captureHair(sim);
    assert.deepEqual(session.getResultPortrait(0).rgba,resultPortrait(snapshot,head,0,'angry').rgba);
    assert.notDeepEqual(session.getResultPortrait(0).rgba,resultPortrait(snapshot,head,0,'neutral').rgba);
    assert.notDeepEqual(session.getResultPortrait(0).rgba,resultPortrait(snapshot,head,0,'sad').rgba);
    session.update(.1,'comb');assert.equal(session.emotion,'angry');
    session.retry();assert.equal(session.emotion,'neutral');
});
test('流程锁定、重复完成、重试与连续客人；漫画不重建发型',()=>{
    const sim=new SurfaceHairSimulation(head),session=new SalonSession(sim,head,()=>0),rig=sim.fiberRig;
    assert.equal(session.phase,'arrival');assert.equal(session.finish(),false);assert.equal(session.nextCustomer(),false);
    session.advanceComic();session.advanceComic();session.advanceComic();assert.equal(session.canStyle,true);assert.equal(sim.fiberRig,rig);
    applyOrderTarget(sim,session.order);assert.equal(session.finish(),true);assert.equal(session.finish(),false);
    session.advanceComic();assert.equal(session.phase,'settling');
    for(let i=0;i<7;i++)session.update(.1,'idle');assert.equal(session.phase,'result');assert.equal(session.result.total,scoreHair(captureHair(sim),session.target,head).total);
    const oldResult=session.result;session.update(.1,'blow');assert.equal(session.result,oldResult);
    assert.equal(session.retry(),true);assert.equal(session.phase,'styling');assert.equal(session.sim.cuts,0);
    session.finish();for(let i=0;i<7;i++)session.update(.1,'idle');
    const previousOrder=session.order;assert.equal(session.nextCustomer(),true);assert.notEqual(session.order,previousOrder);assert.equal(session.customer,2);assert.equal(session.phase,'arrival');assert.equal(session.result,null);
});
