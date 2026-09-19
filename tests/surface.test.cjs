const {test}=require('node:test');
const assert=require('node:assert/strict');
const library=require('../assets/resources/scalp/test-heads.json');
const {ScalpTopology}=require('../.cache/test-core/surface/ScalpTopology');
const {SurfaceHairSimulation}=require('../.cache/test-core/surface/SurfaceHairSimulation');
const {SurfaceHairGeometry}=require('../.cache/test-core/surface/SurfaceHairGeometry');
const {SurfaceScreenCutter}=require('../.cache/test-core/surface/SurfaceScreenCutter');
const tick=(s,n)=>{for(let i=0;i<n;i++)s.advance(1/60);};
const projection={project(x,y,z,o){o.depth=6-z;o.x=300+x/o.depth*600;o.y=300+(y-1.65)/o.depth*600;},rayAt(x,y,o){const dx=(x-300)/600,dy=(y-300)/600,n=Math.hypot(dx,dy,1);Object.assign(o,{ox:0,oy:1.65,oz:6,dx:dx/n,dy:dy/n,dz:-1/n});}};
// 不把不同发缕在根部相接的边焊成一块；逐缕验证闭合与相反绕序。
function closed(sim){
 const mesh=sim.cutMesh||sim.fiberMesh,edges=new Map();
 for(let f=0;f<mesh.indices.length;f+=3)for(let j=0;j<3;j++){
  const a=mesh.indices[f+j],b=mesh.indices[f+(j+1)%3],key=(mesh.groups[f/3]||0)+':'+Math.min(a,b)+':'+Math.max(a,b),entry=edges.get(key)||[0,0];
  entry[0]++;entry[1]+=a<b?1:-1;edges.set(key,entry);
 }
 for(const [key,[n,winding]]of edges){assert.equal(n,2,'发缕开放边：'+key);assert.equal(winding,0,'发缕绕序不一致：'+key);}
}
for(const model of library.models){
 test(model.id+'：头皮面完整归属且无重复，绑定实际头模，边界为一圈',()=>{
  const t=new ScalpTopology(model);assert.equal(t.area.length,model.audit.scalpTriangles);assert.equal(t.count-t.edges.length+t.area.length,1);
  assert.equal(t.edges.filter(e=>e.faces.length===1).length,model.audit.boundaryEdges);assert.ok(t.totalArea>1);
  const faceSet=new Set();for(let f=0;f<t.triangles.length;f+=3)faceSet.add([...t.triangles.slice(f,f+3)].sort((a,b)=>a-b).join(','));assert.equal(faceSet.size,t.area.length);
 });
 for(const style of ['spiky','long'])test(model.id+' '+style+'：初始分缕与局部剃光后逐缕闭合，无覆盖发帽',()=>{
  const s=new SurfaceHairSimulation(model);s.reset(style);const g=new SurfaceHairGeometry();g.update(s);closed(s);assert.ok(g.count>0);
  const lengths=s.lengths.slice();for(let i=0;i<lengths.length;i++){const k=i*3;if(s.topology.roots[k]>.05&&s.topology.roots[k+2]>.05)lengths[i]=0;}
  s.trim(lengths);s.debris.length=0;g.update(s);assert.ok(s.shavedFaces>0&&s.shavedFaces<s.topology.area.length);closed(s);
  s.trim(new Float64Array(s.lengths.length));s.debris.length=0;g.update(s);assert.equal(g.count,0);assert.equal(s.shavedFaces,s.topology.area.length);
 });
 test(model.id+'：旋转时根面绑定，尖端保留惯性，停止后衰减',()=>{
  const s=new SurfaceHairSimulation(model),point={};tick(s,60);const tip=s.p.slice();s.dragTurn(.8);assert.deepEqual(s.p,tip);
  for(let i=0;i<s.lengths.length;i++){s.pointAt(i,0,point);const k=i*3,r=s.topology.roots;assert.ok(Math.abs(point.x-(Math.cos(.8)*r[k]+Math.sin(.8)*r[k+2]))<1e-10);}
  tick(s,2);const velocity=()=>s.p.reduce((n,v,i)=>n+(v-s.previous[i])**2,0);const moving=velocity();assert.ok(moving>1e-5);const yaw=s.yaw;tick(s,500);assert.equal(s.yaw,yaw);assert.ok(velocity()<moving*.001);
 });
 test(model.id+'：剃光笔只删除前方局部根域，不剃头部遮挡的后脑',()=>{
  const s=new SurfaceHairSimulation(model),cut=new SurfaceScreenCutter();assert.ok(cut.sweep(s,projection,278,350,322,350,10,true)>0);
  assert.ok(s.shavedFaces>0&&s.shavedFaces<s.topology.area.length*.4);
  for(let i=0;i<s.lengths.length;i++)if(s.topology.roots[i*3+2]<-.15)assert.equal(s.lengths[i],1);
 });
}
test('两种实际网格拓扑不同，同一个生成器支持切换，清空旧剪切状态',()=>{
 assert.notEqual(library.models[0].scalpPositions.length,library.models[1].scalpPositions.length);
 const s=new SurfaceHairSimulation(library.models[0]);s.trim(new Float64Array(s.lengths.length));s.setHead(library.models[1]);assert.equal(s.shavedFaces,0);assert.equal(s.debris.length,0);assert.equal(s.topology.count,397);
});
test('长度场切断保留端点位置和速度，恢复不复活已经剃光的区域',()=>{
 const s=new SurfaceHairSimulation(library.models[0]);s.dragTurn(.6);tick(s,3);const a={},b={};s.pointAt(12,.4,a);s.pointAt(12,.4,b,true);
 const next=s.lengths.slice();next[12]=.4;next[13]=0;s.trim(next);assert.deepEqual([...s.p.slice(36,39)],[a.x,a.y,a.z]);assert.deepEqual([...s.previous.slice(36,39)],[b.x,b.y,b.z]);
 s.paused=true;const p=s.p.slice();s.advance(100);assert.deepEqual(s.p,p);s.clearVelocity();s.paused=false;tick(s,10);assert.equal(s.lengths[13],0);
});
test('连续剪短与急转后缓冲有界、碎片回收、数值稳定',()=>{
 const s=new SurfaceHairSimulation(library.models[1]),g=new SurfaceHairGeometry();s.reset('long');
 for(let frame=0;frame<450;frame++){
  s.dragTurn(Math.sin(frame*.2)*.3);s.advance(1/60);
  if(frame%20===0){const n=s.lengths.map(x=>Math.max(0,x-.035));s.trim(n);}
  g.update(s);assert.ok(g.count<g.capacity);assert.ok(s.debris.reduce((n,d)=>n+d.p.length/3,0)<=16000);
  for(const x of s.p)assert.ok(Number.isFinite(x)&&Math.abs(x)<6);
 }tick(s,310);assert.equal(s.debris.length,0);
});
test('非法头皮索引、重复面、法线和贴合错误被拒绝',()=>{
 for(const mutate of [m=>m.scalpIndices[0]=-1,m=>m.scalpIndices.push(...m.scalpIndices.slice(0,3)),m=>m.scalpNormals[0]=NaN,m=>m.scalpPositions[0]+=.1]){const m=structuredClone(library.models[0]);mutate(m);assert.throws(()=>new ScalpTopology(m));}
});

test('破洞头皮和无效头模在初始化时拒绝，不能伪称覆盖完整',()=>{
 const hole=structuredClone(library.models[0]);hole.scalpIndices.splice(120,3);assert.throws(()=>new ScalpTopology(hole));
 const bad=structuredClone(library.models[0]);bad.headPositions[5]=NaN;assert.throws(()=>new ScalpTopology(bad));
});
test('屏幕剪短连续表面后保持根域覆盖，查看头皮期间不会误剪',()=>{
 const s=new SurfaceHairSimulation(library.models[0]);s.reset('long');const cutter=new SurfaceScreenCutter();
 assert.ok(cutter.sweep(s,projection,180,240,420,240,8,false)>0);assert.equal(s.shavedFaces,0);assert.ok(s.lengths.some(x=>x<1));
 const g=new SurfaceHairGeometry();s.debris.length=0;g.update(s);closed(s);
 s.debugScalp=true;const before=s.lengths.slice();cutter.begin();assert.equal(cutter.sweep(s,projection,180,350,420,350,22,true),0);assert.deepEqual(s.lengths,before);
});
