const {test}=require('node:test');
const assert=require('node:assert/strict');
const models=require('../assets/resources/scalp/test-heads.json').models;
const {SurfaceHairSimulation}=require('../.cache/test-core/surface/SurfaceHairSimulation');
const {SurfaceHairGeometry}=require('../.cache/test-core/surface/SurfaceHairGeometry');
const {partitionRoots}=require('../.cache/test-core/surface/FiberLayout');
const {PlaneHairCutter}=require('../.cache/test-core/surface/PlaneHairCutter');
const {pose}=require('../.cache/test-core/surface/HeadPose');
const tick=(s,n)=>{for(let i=0;i<n;i++)s.advance(1/60);};
for(const model of models)for(const style of ['spiky','long'])test(model.id+' '+style+'：根域无重叠无遗漏、多环独立发束、截面随方向收窄',()=>{
 const s=new SurfaceHairSimulation(model);s.reset(style);const cells=partitionRoots(s),seen=new Uint8Array(s.topology.area.length);let area=0;
 for(const cell of cells)for(const f of cell.faces){seen[f]++;area+=s.topology.area[f];}assert.ok(seen.every(x=>x===1));assert.ok(Math.abs(area-s.topology.totalArea)<1e-10);
 const mesh=s.fiberMesh;assert.equal(new Set(mesh.groups).size,cells.length);assert.equal(s.p.length/3,s.topology.count,'视觉发缕不能新增逐缕物理粒子链');
 s.dragTurn(.4,.2);const p=mesh.evaluate(s),expected={};
 for(let group=0;group<cells.length;group++){
  const fiber=s.fiberRig.fibers[group],rootIds=cells[group].boundary,n=rootIds.length;
  for(let j=0;j<n;j++){
   const i=rootIds[j]*3,r=s.topology.roots;pose(r[i],r[i+1],r[i+2],s.yaw,s.pitch,model.center,expected);const k=(fiber.base+j)*3;
   assert.ok(Math.hypot(p[k]-expected.x,p[k+1]-expected.y,p[k+2]-expected.z)<1e-10,'发根必须精确落在自己的原头皮顶点');
  }
  for(let j=0;j<n;j++){
   const a=(fiber.base+j)*3,b=(fiber.base+(j+1)%n)*3,c=(fiber.base+(s.fiberRig.levels.length-1)*n+j)*3,d=(fiber.base+(s.fiberRig.levels.length-1)*n+(j+1)%n)*3;
   const base=Math.hypot(p[a]-p[b],p[a+1]-p[b+1],p[a+2]-p[b+2]),end=Math.hypot(p[c]-p[d],p[c+1]-p[d+1],p[c+2]-p[d+2]);
   assert.ok(end<base*.2,'末端必须比根区窄，而非整片平板');
  }
 }
});
test('一刀生成多个独立小封口，碎发保持切前速度后分别散开',()=>{
 const s=new SurfaceHairSimulation(models[0]);s.reset('long');const c=new PlaneHairCutter(),original=s.fiberMesh.evaluate(s).slice(),spans=new Map();
 for(let f=0;f<s.fiberMesh.indices.length;f+=3){const group=s.fiberMesh.groups[f/3],span=spans.get(group)||[Infinity,-Infinity];for(let j=0;j<3;j++){const k=s.fiberMesh.indices[f+j]*3,d=.15*original[k]-original[k+1]+.85;span[0]=Math.min(span[0],d);span[1]=Math.max(span[1],d);}spans.set(group,span);}
 const expected=new Set([...spans].filter(([,v])=>v[0]<-1e-8&&v[1]>1e-8).map(([g])=>g));assert.ok(expected.size>1);assert.equal(c.clip(s,{x:.15,y:-1,z:0,d:.85}).changed,true);
 const mesh=s.cutMesh,capGroups=new Set();for(let f=0;f<mesh.caps.length;f++)if(mesh.caps[f])capGroups.add(mesh.groups[f]);assert.deepEqual(capGroups,expected,'每个相交发束应有独立封口');
 const d=s.debris[0];assert.deepEqual(new Set(d.groups),expected);assert.deepEqual(d.p,d.previous,'静止落刀瞬间继承零速度');
 const before=d.p.slice();tick(s,8);const movement=new Map();for(let f=0;f<d.groups.length;f++)movement.set(d.groups[f],d.p[f*9]-before[f*9]);
 assert.ok(new Set([...movement.values()].map(x=>x.toFixed(5))).size>=Math.ceil(expected.size*.5),'不同发缕应分散，不能继续作为整块下落');
 const trianglesByGroup=new Map();for(let f=0;f<d.groups.length;f++){const id=d.groups[f];if(!trianglesByGroup.has(id))trianglesByGroup.set(id,[]);trianglesByGroup.get(id).push(f);}
 for(const entries of trianglesByGroup.values()){const first=entries[0]*9,dx=d.p[first]-before[first];for(const f of entries)assert.ok(Math.abs(d.p[f*9]-before[f*9]-dx)<1e-10,'一缕内部各面不能散开撕裂');}
});
test('分缕剪切后局部剃光、全剃、恢复与资源预算',()=>{
 const s=new SurfaceHairSimulation(models[1]);s.reset('long');const c=new PlaneHairCutter(),g=new SurfaceHairGeometry();assert.ok(c.clip(s,{x:.12,y:-1,z:0,d:.85}).changed);
 const next=s.lengths.slice();for(let i=0;i<next.length;i++)if(s.topology.roots[i*3]>.2)next[i]=0;s.trim(next);s.debris.length=0;g.update(s);assert.ok(g.count>0&&g.count<g.capacity);
 s.trim(new Float64Array(s.lengths.length));s.debris.length=0;g.update(s);assert.equal(g.count,0);assert.equal(s.fiberMesh.distance({ox:0,oy:3,oz:6,dx:0,dy:0,dz:-1},s),Infinity);
 s.reset();assert.equal(s.cutMesh,null);g.update(s);assert.ok(g.count>0);assert.ok(s.debris.length===0);
});
