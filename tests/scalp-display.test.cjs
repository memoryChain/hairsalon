const {test}=require('node:test');
const assert=require('node:assert/strict');
const {ScalpDisplayMesh}=require('../.cache/test-core/surface/ScalpDisplayMesh');
const {HeadRaycast}=require('../.cache/test-core/surface/HeadRaycast');
const {SurfaceHairSimulation}=require('../.cache/test-core/surface/SurfaceHairSimulation');
const {SurfaceHairGeometry}=require('../.cache/test-core/surface/SurfaceHairGeometry');
const {pose}=require('../.cache/test-core/surface/HeadPose');
const models=[require('../assets/resources/scalp/user-head.json'),...require('../assets/resources/scalp/test-heads.json').models];
for(const h of models)test(h.id+'：头皮显示面顶点、边中点和面内采样均位于可见头模外',()=>{
 const original=JSON.stringify(h),g=new ScalpDisplayMesh(h),full=h.characterMesh;
 const ray=new HeadRaycast(full?{...h,headPositions:full.positions,headIndices:full.indices,headNormals:full.normals}:h),c=h.center,r={};
 let minimum=Infinity;
 for(let f=0;f<g.indices.length;f+=3)for(let i=0;i<=7;i++)for(let j=0;j<=7-i;j++){
  let x=0,y=0,z=0;
  for(const [v,w]of [[0,i/7],[1,j/7],[2,1-(i+j)/7]]){const k=g.indices[f+v]*3;x+=g.positions[k]*w;y+=g.positions[k+1]*w;z+=g.positions[k+2]*w;}
  x-=c[0];y-=c[1];z-=c[2];const d=Math.hypot(x,y,z);
  Object.assign(r,{ox:c[0]+x/d*3,oy:c[1]+y/d*3,oz:c[2]+z/d*3,dx:-x/d,dy:-y/d,dz:-z/d});
  const clearance=d-(3-ray.distance(r,0));assert.ok(Number.isFinite(clearance));minimum=Math.min(minimum,clearance);
 }
 assert.ok(minimum>.0001,'最小表面间距 '+minimum);assert.equal(JSON.stringify(h),original);
 const edges=new Map(),used=new Set();
 for(let f=0;f<g.indices.length;f+=3)for(let j=0;j<3;j++){
  const a=g.indices[f+j],b=g.indices[f+(j+1)%3],key=Math.min(a,b)+':'+Math.max(a,b);used.add(a);edges.set(key,(edges.get(key)||0)+1);
 }
 assert.equal(used.size-edges.size+g.indices.length/3,1);for(const n of edges.values())assert.ok(n===1||n===2);
});
test('显示头皮随整体旋转，缓存复用，退出查看与全部剃光不留下覆盖层',()=>{
 const s=new SurfaceHairSimulation(models[0]),g=new SurfaceHairGeometry();s.debugScalp=true;g.update(s);
 const before=g.view.positions.slice(),display=g.scalpDisplay,point={};s.dragTurn(.9,.25);g.update(s);
 assert.equal(g.scalpDisplay,display);assert.equal(g.count,before.length/3);assert.ok(g.count<g.capacity);
 for(let k=0;k<before.length;k+=3){pose(before[k],before[k+1],before[k+2],s.yaw,s.pitch,s.topology.asset.center,point);assert.ok(Math.hypot(g.positions[k]-point.x,g.positions[k+1]-point.y,g.positions[k+2]-point.z)<1e-6);}
 s.debugScalp=false;s.trim(new Float64Array(s.lengths.length));s.debris.length=0;g.update(s);assert.equal(g.count,0);
 s.setHead(models[2]);s.debugScalp=true;g.update(s);assert.notEqual(g.scalpDisplay,display);assert.ok(g.count<g.capacity);
});
