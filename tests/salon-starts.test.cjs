const {test}=require('node:test');
const assert=require('node:assert/strict');
const {SurfaceHairSimulation}=require('../.cache/test-core/surface/SurfaceHairSimulation');
const {SALON_ORDERS,SalonSession,applyOrderTarget}=require('../.cache/test-core/gameplay/SalonSession');
const {getInitialLooks,applyInitialLook}=require('../.cache/test-core/gameplay/InitialLooks');
const {captureHair,scoreHair}=require('../.cache/test-core/gameplay/HairScore');
const {targetPlanes,trimToTarget}=require('./helpers/trim-to-target.cjs');
const head=require('../assets/resources/scalp/user-head.json');
const {comicBounds,stylingCameraZ}=require('../.cache/test-core/gameplay/ComicFraming');
const {CONFIG}=require('../.cache/test-core/core/PrototypeConfig');

test('兼容组合初始几何确实不同于目标，正常评分不高，真实修剪仍可达高分',()=>{
    const reused=new Map();let crossStyles=0;
    for(const order of SALON_ORDERS){
        const model=new SurfaceHairSimulation(head);model.reset(order.style);applyOrderTarget(model,order);
        const target=captureHair(model),saved=target.positions.slice(),bounds=targetPlanes(model,order.id==='animal-sheep');
        const sim=new SurfaceHairSimulation(head),looks=getInitialLooks(order);assert.ok(looks.length>=2,order.id);
        const fingerprints=new Set();
        for(const look of looks){
            const label=order.id+' / '+look.id;
            reused.set(look.id,(reused.get(look.id)||0)+1);if(look.style!==order.style)crossStyles++;
            applyInitialLook(sim,look);const initial=captureHair(sim),before=scoreHair(initial,target,head);
            assert.ok(before.total>0&&before.total<=59,label+' 按原评分自然低于及格线');
            assert.ok(before.silhouette<=65,label+' 必须有明显轮廓差异，不能只降低走向分');
            fingerprints.add(JSON.stringify(Array.from(initial.tips,v=>Math.round(v*10000))));
            sim.dragTurn(.8,.2);sim.fiberRig.wind.fill(.2);sim.cuts+=100;
            assert.equal(scoreHair(captureHair(sim),target,head).total,before.total,label+' 空操作不改变几何评分');
            sim.yaw=sim.targetYaw=sim.pitch=0;sim.fiberRig.wind.fill(0);sim.clearVelocity();
            trimToTarget(sim,order,bounds);
            assert.ok(scoreHair(captureHair(sim),target,head).total>=(order.id==='animal-sheep'?85:90),label+' 必须可达高分');
            assert.deepEqual(target.positions,saved,'换初始造型不能改评分目标');
            sim.lengths.fill(0);assert.ok(scoreHair(captureHair(sim),target,head).total<25,label);
        }
        assert.ok(fingerprints.size>=2,order.id+' 不能仅有不同名字');
    }
    assert.ok(crossStyles>=5,'兼容池必须包含跨预设配对');
    assert.ok([...reused.values()].some(n=>n>=3),'同一初始造型必须可服务多个目标');
});

test('跨发束数评分按区域特征比较，拆分或重排发束不改变分数',()=>{
    const sim=new SurfaceHairSimulation(head);sim.reset('bob');const target=captureHair(sim);
    const expanded={...target,weights:[],tips:[],regions:[]};
    for(let i=target.weights.length-1;i>=0;i--)for(let part=0;part<2;part++){
        expanded.weights.push(target.weights[i]/2);expanded.regions.push(target.regions[i]);expanded.tips.push(...target.tips.slice(i*3,i*3+3));
    }
    assert.equal(scoreHair(expanded,target,head).total,100);
});
function finish(session){
    session.advanceComic();session.advanceComic();session.advanceComic();session.finish();
    for(let j=0;j<7;j++)session.update(.1,'idle');
}
test('不操作按正常几何计分；同一目标再次来访换造型，重试准确恢复',()=>{
    const sim=new SurfaceHairSimulation(head),session=new SalonSession(sim,head,()=>0);
    const order=session.order,first=session.initialLook.id,target=session.target.positions.slice();
    for(let i=0;i<SALON_ORDERS.length;i++){
        const expected=scoreHair(captureHair(sim),session.target,head);
        finish(session);assert.equal(session.result.total,expected.total);
        assert.ok(session.result.total>0&&session.result.total<=59);session.nextCustomer();
    }
    assert.equal(session.order,order);assert.notEqual(session.initialLook.id,first);assert.deepEqual(session.target.positions,target);
    const initial=captureHair(sim),look=session.initialLook;
    applyOrderTarget(sim,order);finish(session);session.retry();
    assert.equal(session.initialLook,look);assert.deepEqual(captureHair(sim),initial);
    finish(session);assert.equal(session.result.total,scoreHair(initial,session.target,head).total);
});
test('最终几何一致就同分，不因起点或操作计数扣分；目标几何本身仍满分',()=>{
    for(const random of [()=>0,()=>.02]){
        const sim=new SurfaceHairSimulation(head),session=new SalonSession(sim,head,random);
        // 隔离评分规则：直接构造相同成品，故意清空操作计数。
        sim.reset(session.order.style);applyOrderTarget(sim,session.order);sim.cuts=0;
        finish(session);assert.equal(session.result.total,100);assert.equal(session.result.stars,3);
    }
});
test('夸张加长造型经过转头与步进保持有限坐标和局部发根绑定',()=>{
    for(const style of ['quiff','afro','bob','spiky']){
        const sim=new SurfaceHairSimulation(head);sim.reset(style,2.6);
        for(let i=0;i<120;i++){if(i===20)sim.dragTurn(.8,.15);sim.advance(1/60);}
        assert.ok(Array.from(sim.p).every(Number.isFinite));
        const p=sim.fiberMesh.evaluate(sim);assert.ok(Array.from(p).every(Number.isFinite));
        const point={x:0,y:0,z:0};
        for(const f of sim.fiberRig.fibers)for(let j=0;j<f.ids.length;j++){
            sim.pointAt(f.ids[j],0,point);const k=(f.base+j)*3;
            assert.ok(Math.hypot(p[k]-point.x,p[k+1]-point.y,p[k+2]-point.z)<1e-6);
        }
        const stable=captureHair(sim),bounds=comicBounds(head.characterMesh.positions,stable.positions);
        for(const aspect of [390/844,1,1.8]){
            const z=stylingCameraZ(bounds,aspect,CONFIG.fov,CONFIG.cameraY,CONFIG.cameraZ),tan=Math.tan(CONFIG.fov*Math.PI/360);
            for(const positions of [head.characterMesh.positions,stable.positions])for(let k=0;k<positions.length;k+=3){
                const depth=z-positions[k+2];
                assert.ok(Math.abs(positions[k]/(depth*tan*aspect))<1);
                assert.ok(Math.abs((positions[k+1]-CONFIG.cameraY)/(depth*tan))<1);
            }
        }
    }
});
