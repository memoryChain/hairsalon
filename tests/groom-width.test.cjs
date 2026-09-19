const {test}=require('node:test'),assert=require('node:assert/strict');
const {SurfaceHairSimulation}=require('../.cache/test-core/surface/SurfaceHairSimulation');
const {SurfaceHairGeometry}=require('../.cache/test-core/surface/SurfaceHairGeometry');
const {HAIR_STYLES}=require('../.cache/test-core/core/HairstyleCatalog');
const head=require('../assets/resources/scalp/user-head.json');
for(const style of HAIR_STYLES)test(style+'：反复换向梳理与剪短后，碰撞不能撑大截面和发梢',()=>{
 const s=new SurfaceHairSimulation(head);s.reset(style);const rig=s.fiberRig,g=new SurfaceHairGeometry(),out={},original=s.groomCollision.constrain.bind(s.groomCollision);let checked=0;
 s.groomCollision.constrain=(p,base,corners,rings,...args)=>{
  const before=p.slice(base*3,(base+corners*rings)*3);original(p,base,corners,rings,...args);
  for(let j=0;j<corners*3;j++)assert.ok(Math.abs(p[base*3+j]-before[j])<1e-9,'碰撞不能移动发根');
  for(let ring=1;ring<rings;ring++)for(let corner=1;corner<corners;corner++)for(let a=0;a<3;a++){
   const k=(ring*corners+corner)*3+a,first=ring*corners*3+a;
   assert.ok(Math.abs((p[base*3+k]-p[base*3+first])-(before[k]-before[first]))<1e-8,'截面应整体避让，禁止逐点拉成宽片');
  }
  checked++;
 };
 for(let step=0;step<100;step++){
  const angle=step*2.399;
  for(const f of rig.fibers)rig.comb(f.group,Math.sin(angle),Math.cos(angle),Math.sin(angle*.71),.6,s,out);
  if(step===50){s.trim(Float64Array.from(s.lengths,v=>v*.55));s.debris.length=0;}
  if(step===70)s.dragTurn(.7,.25);
  for(const previous of [false,true])assert.ok(rig.evaluate(s,previous).every(Number.isFinite));
 }
 g.update(s);assert.ok(g.count<=g.capacity);assert.ok(checked>0);
});
