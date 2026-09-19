const {test}=require('node:test');
const assert=require('node:assert/strict');
const models=[require('../assets/resources/scalp/user-head.json'),...require('../assets/resources/scalp/test-heads.json').models];
const {SurfaceHairSimulation}=require('../.cache/test-core/surface/SurfaceHairSimulation');
const {SurfaceHairGeometry}=require('../.cache/test-core/surface/SurfaceHairGeometry');
const {partitionRoots}=require('../.cache/test-core/surface/FiberLayout');
for(const model of models)test(model.id+'：秃顶真实缺少根区发体，全秃工具不产生虚假剪切',()=>{
 const s=new SurfaceHairSimulation(model),g=new SurfaceHairGeometry();
 for(const style of ['crown','horseshoe','combover']){
  s.reset(style);const cells=partitionRoots(s),covered=new Set(cells.flatMap(c=>c.faces));
  assert.ok(covered.size>0&&covered.size<s.topology.area.length*.85);
  assert.equal(cells.flatMap(c=>c.faces).length,covered.size);
  const r=s.topology.roots,c=s.topology.asset.center;
  for(const cell of cells){let x=0,y=0,z=0;for(const id of cell.boundary){x+=r[id*3]-c[0];y+=r[id*3+1]-c[1];z+=r[id*3+2]-c[2];}x/=cell.boundary.length;y/=cell.boundary.length;z/=cell.boundary.length;
   if(style==='crown')assert.ok(!(Math.abs(x)<.10&&Math.abs(z+.11)<.10&&y>.5),'头顶中央不能有发根');
   else assert.ok(!(y>.64&&Math.abs(x)<.15),'马蹄形顶部不能有发根');
  }
  const original=Array.from(s.lengths);assert.ok(original.some(n=>n===0));s.trim(new Float64Array(s.lengths.length));s.reset(style);assert.deepEqual(Array.from(s.lengths),original);
 }
 s.reset('bald');g.update(s);assert.equal(s.fiberRig.fibers.length,0);assert.equal(g.count,0);assert.ok(s.lengths.every(n=>n===0));
 assert.equal(s.trim(new Float64Array(s.lengths.length)),0);assert.equal(s.cuts,0);assert.equal(s.debris.length,0);
 s.dragTurn(1,.3);s.advance(1/30);g.update(s);assert.equal(g.count,0);
 s.reset('long');g.update(s);assert.ok(g.count>0);assert.ok(s.lengths.every(n=>n===1));
});

for(const model of models)test(model.id+'：侧梳长束跨越头顶，修剪后切全秃再切回正确刷新',()=>{
 const s=new SurfaceHairSimulation(model),g=new SurfaceHairGeometry(),c=model.center;
 s.reset('combover');g.update(s);
 const long=s.fiberRig.fibers.filter(f=>f.restLength>.5);
 assert.ok(long.length>0,'侧梳必须保留从侧面跨过头顶的真实长束');
 for(const f of long){assert.ok(f.root[0]>c[0]+.15);assert.ok(f.end[0]<c[0]-.2);assert.ok(f.end[1]>c[1]+.6);}
 const original=Array.from(g.view.positions),lengths=Float64Array.from(s.lengths);
 for(const f of long)for(const id of f.ids)lengths[id]=.2;
 assert.ok(s.trim(lengths)>0);g.update(s);assert.notDeepEqual(Array.from(g.view.positions),original);
 s.reset('bald');g.update(s);
 assert.equal(s.style,'bald');assert.equal(g.count,0);assert.equal(g.view.positions.length,0);assert.equal(g.view.colors.length,0);assert.equal(s.debris.length,0);
 s.advance(1/30);g.update(s);assert.equal(g.count,0);
 s.reset('combover');g.update(s);
 assert.equal(s.style,'combover');assert.equal(s.cuts,0);assert.deepEqual(Array.from(g.view.positions),original);
});
