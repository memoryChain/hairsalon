const { test } = require('node:test');
const assert = require('node:assert/strict');
const { HairSimulation } = require('../.cache/test-core/hair/HairSimulation');
const { makeStrand } = require('../.cache/test-core/hair/HairPresets');
const { HairScreenCutter } = require('../.cache/test-core/hair/HairScreenCutter');
// 固定透视镜头，纵向坐标向上；测试坐标采用屏幕像素。
const projection = {
    project(x,y,z,out) { out.depth=6-z; out.x=300+x/out.depth*600; out.y=300+(y-1.65)/out.depth*600; },
    rayAt(x,y,out) { const dx=(x-300)/600,dy=(y-300)/600,n=Math.hypot(dx,dy,1); Object.assign(out,{ox:0,oy:1.65,oz:6,dx:dx/n,dy:dy/n,dz:-1/n}); }
};
const strand = (id,x,z=0,r=.025) => makeStrand(id,[x,3,z,x,2.5,z],[r,r],'spiky');
function scene(strands) { const sim=new HairSimulation();sim.strands=strands;return sim; }
const point = (x,y,z) => { const p={};projection.project(x,y,z,p);return p; };
test('单次快速长划线穿过多簇细发，与分段输入一致',()=>{
    const make=()=>scene(Array.from({length:9},(_,i)=>strand(i,(i-4)*.22)));
    const a=make(),b=make(),ca=new HairScreenCutter(),cb=new HairScreenCutter();
    assert.equal(ca.sweep(a,projection,180,410,420,410,0),9);
    for(let x=180;x<420;x+=5) cb.sweep(b,projection,x,410,x+5,410,0);
    assert.equal(b.cuts,9);
    for(let i=0;i<9;i++) assert.deepEqual(a.strands[i].p,b.strands[i].p);
});
test('划线外的发束不剪，边缘有刀宽容差，点击可剪',()=>{
    const sim=scene([strand(0,0)]),c=new HairScreenCutter();
    assert.equal(c.sweep(sim,projection,312,400,312,420,0),0);
    assert.equal(c.sweep(sim,projection,307,410,307,410,5),1);
});
test('剪点按透视深度还原，斜向镜头发束仍准确落在划线上',()=>{
    const s=makeStrand(0,[-.7,3,0,.7,2.5,2],[.03,.03],'spiky');
    const sim=scene([s]),c=new HairScreenCutter(),expected=point(0,2.75,1);
    assert.equal(c.sweep(sim,projection,150,expected.y,450,expected.y,0),1);
    const cut=point(...s.p.slice(-3));
    assert.ok(Math.abs(cut.y-expected.y)<1e-8);
    assert.ok(Math.abs(s.p[s.p.length-3])<1e-8);
});
test('重叠多层一起剪，但不能穿过头部剪后脑',()=>{
    const sim=scene([
        makeStrand(0,[0,2.1,.8,0,1.3,.8],[.03,.03],'spiky'),
        makeStrand(1,[0,2.1,1,0,1.3,1],[.03,.03],'spiky'),
        makeStrand(2,[0,2.1,-.8,0,1.3,-.8],[.03,.03],'spiky')
    ]);
    assert.equal(new HairScreenCutter().sweep(sim,projection,250,300,350,300,0),2);
    assert.equal(sim.strands[2].p[4],1.3);
});
test('同一手势不反复削短，下个手势可继续修剪',()=>{
    const sim=scene([strand(0,0)]),c=new HairScreenCutter();c.begin();
    assert.equal(c.sweep(sim,projection,250,410,350,410,0),1);
    assert.equal(c.sweep(sim,projection,250,422,350,422,0),0);
    c.end();c.begin();
    assert.equal(c.sweep(sim,projection,250,422,350,422,0),1);
});
test('投影到头外的后侧发束仍能剪，极短残段保护仍生效',()=>{
    const sim=scene([makeStrand(0,[1,2.1,-.8,1,1.3,-.8],[.03,.03],'spiky')]);
    const p=point(1,1.7,-.8),c=new HairScreenCutter();
    assert.equal(c.sweep(sim,projection,p.x-20,p.y,p.x+20,p.y,0),1);
    c.end(); const q=point(1,2.09,-.8);
    assert.equal(c.sweep(sim,projection,q.x-20,q.y,q.x+20,q.y,0),0);
});
