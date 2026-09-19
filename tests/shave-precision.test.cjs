const {test}=require('node:test');
const assert=require('node:assert/strict');
const models=require('../assets/resources/scalp/test-heads.json').models;
const {SurfaceHairSimulation}=require('../.cache/test-core/surface/SurfaceHairSimulation');
const {SurfaceScreenCutter}=require('../.cache/test-core/surface/SurfaceScreenCutter');
const {CONFIG}=require('../.cache/test-core/core/PrototypeConfig');
const projection={project(x,y,z,o){o.depth=6-z;o.x=300+x/o.depth*600;o.y=300+(y-1.65)/o.depth*600;},rayAt(x,y,o){const dx=(x-300)/600,dy=(y-300)/600,n=Math.hypot(dx,dy,1);Object.assign(o,{ox:0,oy:1.65,oz:6,dx:dx/n,dy:dy/n,dz:-1/n});}};
const segmentDistance=(x,y,ax,ay,bx,by)=>{const dx=bx-ax,dy=by-ay,t=Math.max(0,Math.min(1,((x-ax)*dx+(y-ay)*dy)/(dx*dx+dy*dy||1)));return Math.hypot(x-ax-t*dx,y-ay-t*dy);};
for(const model of models){
 test(model.id+'：剃刀不选中轨迹半径外的发根，不经三角面扩张',()=>{
  const s=new SurfaceHairSimulation(model),cut=new SurfaceScreenCutter(),p={},q={};
  const count=cut.sweep(s,projection,278,350,322,350,CONFIG.shaveRadiusPixels,true);assert.ok(count>0);
  for(let i=0;i<s.lengths.length;i++)if(s.lengths[i]===0){s.pointAt(i,0,p);projection.project(p.x,p.y,p.z,q);assert.ok(segmentDistance(q.x,q.y,278,350,322,350)<=CONFIG.shaveRadiusPixels+1e-8);}
  const coarse=new SurfaceHairSimulation(model);assert.ok(new SurfaceScreenCutter().sweep(coarse,projection,278,350,322,350,22,true)>count);
 });
 test(model.id+'：快速剃刀轨迹与逐段涂抹一致，反复涂抹不扩大范围',()=>{
  const a=new SurfaceHairSimulation(model),b=new SurfaceHairSimulation(model),ca=new SurfaceScreenCutter(),cb=new SurfaceScreenCutter();
  ca.sweep(a,projection,265,348,335,357,12,true);
  for(let i=0;i<14;i++)cb.sweep(b,projection,265+i*5,348+i*9/14,270+i*5,348+(i+1)*9/14,12,true);
  assert.deepEqual(a.lengths,b.lengths);const before=a.lengths.slice();ca.end();ca.begin();assert.equal(ca.sweep(a,projection,265,348,335,357,12,true),0);assert.deepEqual(a.lengths,before);
 });
}
test('剃刀暂停与查看头皮无副作用，反向纵轴和双倍像素比例一致',()=>{
 const a=new SurfaceHairSimulation(models[0]),b=new SurfaceHairSimulation(models[0]),cut=new SurfaceScreenCutter();
 for(const flag of ['paused','debugScalp']){a[flag]=true;assert.equal(cut.sweep(a,projection,278,350,322,350,12,true),0);a[flag]=false;}assert.ok(a.lengths.every(v=>v===1));
 const flipped={project(x,y,z,o){projection.project(x,y,z,o);o.x*=2;o.y=1200-o.y*2;},rayAt(x,y,o){projection.rayAt(x/2,(1200-y)/2,o);}};
 cut.sweep(a,projection,278,350,322,350,12,true);new SurfaceScreenCutter().sweep(b,flipped,556,500,644,500,24,true);assert.deepEqual(a.lengths,b.lengths);
});
