const {test}=require('node:test'),assert=require('node:assert/strict');
const {HAIR_STYLES,cycleStyle}=require('../.cache/test-core/core/HairstyleCatalog');
const {SurfaceHairSimulation}=require('../.cache/test-core/surface/SurfaceHairSimulation');
const {SurfaceHairGeometry}=require('../.cache/test-core/surface/SurfaceHairGeometry');
const head=require('../assets/resources/scalp/user-head.json');
test('初始目录移除低改造余量短发，保留循环和长发选择',()=>{
 for(const id of ['crop','mohawk','quiff','sidepart','asymmetric','flipped','receding','crown','horseshoe','bald'])assert.ok(!HAIR_STYLES.includes(id));
 for(let i=0;i<HAIR_STYLES.length;i++){assert.equal(cycleStyle(HAIR_STYLES[i],1),HAIR_STYLES[(i+1)%HAIR_STYLES.length]);assert.equal(cycleStyle(HAIR_STYLES[i],-1),HAIR_STYLES[(i+HAIR_STYLES.length-1)%HAIR_STYLES.length]);}
});
for(const style of ['afro','mane','waves','curtains','doublecover','backcover','crownlong'])test(style+'：有真实留长余量，可梳理、剪短和恢复',()=>{
 const s=new SurfaceHairSimulation(head),g=new SurfaceHairGeometry();s.reset(style);
 const fibers=s.fiberRig.fibers,long=fibers.filter(f=>f.restLength>.6),c=head.center;
 assert.ok(long.length>=(style==='doublecover'?2:style==='backcover'?5:fibers.length*.7));
 if(style==='doublecover'){assert.ok(long.some(f=>f.root[0]>c[0]&&f.end[0]<c[0]));assert.ok(long.some(f=>f.root[0]<c[0]&&f.end[0]>c[0]));}
 if(style==='backcover')assert.ok(long.every(f=>f.root[2]<c[2]&&f.end[2]>c[2]));
 if(['doublecover','backcover','crownlong'].includes(style))assert.ok(s.shavedFaces>100);
 const original=Array.from(s.fiberMesh.evaluate(s)),out={};for(let i=0;i<3;i++)s.fiberRig.comb(long[0].group,-1,.3,.1,.12,s,out);
 assert.notDeepEqual(Array.from(s.fiberMesh.evaluate(s)),original);g.update(s);assert.ok(g.count<g.capacity);assert.ok(g.view.positions.every(Number.isFinite));
 const lengths=Float64Array.from(s.lengths,v=>v*.45);assert.ok(s.trim(lengths)>0);g.update(s);assert.ok(g.count<g.capacity);s.reset(style);assert.deepEqual(Array.from(s.fiberMesh.evaluate(s)),original);
});
