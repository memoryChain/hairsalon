const {test}=require('node:test');
const assert=require('node:assert/strict');
const models=require('../assets/resources/scalp/test-heads.json').models;
const {SurfaceHairSimulation}=require('../.cache/test-core/surface/SurfaceHairSimulation');
const {HAIR_PRESETS}=require('../.cache/test-core/core/HairstyleCatalog');
function arc(f,bulge){let x=f.root[0],y=f.root[1],z=f.root[2],total=0;for(let j=1;j<=16;j++){const t=j/16,q=1-t,p=f.root.map((v,a)=>q*q*q*v+3*q*q*t*(v+f.normal[a]*bulge)+3*q*t*t*f.control[a]+t*t*t*f.end[a]);total+=Math.hypot(p[0]-x,p[1]-y,p[2]-z);[x,y,z]=p;}return total;}
for(const model of models)test(model.id+'：左侧剃光后，右侧长发可越过中线覆盖，原剃除结果保持',()=>{
 const s=new SurfaceHairSimulation(model);s.reset('long');const next=s.lengths.slice();for(let i=0;i<next.length;i++)if(s.topology.roots[i*3]<0)next[i]=0;s.trim(next);
 const original=s.lengths.slice(),rig=s.fiberRig,chosen=rig.fibers.filter(f=>f.root[0]>.1&&f.root[1]>1.9&&f.ids.every(i=>s.lengths[i]>0)),out={};assert.ok(chosen.length>10);
 for(let step=0;step<30;step++)for(const f of chosen)rig.comb(f.group,-1,.4,0,.1,s,out);
 const p=rig.evaluate(s,false);let crossed=0,inward=0;
 for(const f of chosen){let x=0;for(let j=0;j<f.ids.length;j++)x+=p[(f.base+(rig.levels.length-1)*f.ids.length+j)*3]/f.ids.length;if(x<-.15)crossed++;
  if(f.end.reduce((sum,v,a)=>sum+(v-f.root[a])*f.normal[a],0)<-.05)inward++;
  assert.ok(Math.abs(arc(f,HAIR_PRESETS.long.bulge)-f.restLength)<f.restLength*.006);
 }
 assert.ok(crossed>chosen.length*.7,'足够长的发梢应覆盖到左侧');assert.ok(inward>chosen.length*.5,'不再锁在发根外侧半球');assert.deepEqual(s.lengths,original);assert.ok(p.every(Number.isFinite));
 const saved=chosen.map(f=>f.end.slice());s.dragTurn(.5,.2);for(let i=0;i<120;i++)s.advance(1/60);assert.deepEqual(chosen.map(f=>f.end),saved);assert.deepEqual(s.lengths,original);
});
