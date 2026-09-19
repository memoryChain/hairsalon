const {test}=require('node:test');
const assert=require('node:assert/strict');
const models=require('../assets/resources/scalp/test-heads.json').models;
const {SurfaceHairSimulation}=require('../.cache/test-core/surface/SurfaceHairSimulation');
const {ScalpTopology}=require('../.cache/test-core/surface/ScalpTopology');
const {HAIR_STYLES}=require('../.cache/test-core/core/HairstyleCatalog');
const {hairlineAngle}=require('../.cache/test-core/surface/HairlineProfile');
for(const model of models)test(model.id+'：可选发型发际线精确贴合原头模，边界连续且切换不累积变形',()=>{
 const before=JSON.stringify(model),s=new SurfaceHairSimulation(model),signatures=new Set();
 for(const style of HAIR_STYLES){s.reset(style);const t=s.topology,a=t.asset,ix=t.triangles,b=a.scalpSurfaceBindings,p=t.roots;
  assert.equal(t.count,model.scalpPositions.length/3);assert.deepEqual(Array.from(ix),model.scalpIndices);assert.equal(a.headPositions,model.headPositions);assert.equal(a.headIndices,model.headIndices);
  for(let i=0;i<t.count;i++){const face=b[i*4],weights=b.slice(i*4+1,i*4+4);assert.ok(Math.abs(weights.reduce((x,y)=>x+y,0)-1)<1e-8);for(let axis=0;axis<3;axis++){const value=weights.reduce((sum,w,j)=>sum+w*model.headPositions[model.headIndices[face*3+j]*3+axis],0);assert.ok(Math.abs(value-p[i*3+axis])<1e-6);}}
  for(let f=0;f<ix.length;f+=3){const ia=ix[f]*3,ib=ix[f+1]*3,ic=ix[f+2]*3,ux=p[ib]-p[ia],uy=p[ib+1]-p[ia+1],uz=p[ib+2]-p[ia+2],vx=p[ic]-p[ia],vy=p[ic+1]-p[ia+1],vz=p[ic+2]-p[ia+2];const nx=uy*vz-uz*vy,ny=uz*vx-ux*vz,nz=ux*vy-uy*vx;assert.ok(nx*t.normals[ia]+ny*t.normals[ia+1]+nz*t.normals[ia+2]>0);}
  assert.ok(hairlineAngle(style,1.57)<hairlineAngle(style,1.35),'耳上边界高于耳前鬓角');assert.ok(hairlineAngle(style,.85)<1.12,'额角不再过低');
  signatures.add(JSON.stringify(Array.from(p)));s.reset('long');s.reset(style);assert.equal(s.topology,t);
 }
 assert.equal(signatures.size,HAIR_STYLES.length-2,'三款马蹄秃顶遮盖共用发际线，其余造型独立');assert.equal(JSON.stringify(model),before);
});
test('发际线表面绑定越界或脱离头模时拒绝导入',()=>{
 const s=new SurfaceHairSimulation(models[0]),a=s.topology.asset,bad={...a,scalpSurfaceBindings:a.scalpSurfaceBindings.slice()};bad.scalpSurfaceBindings[0]=-1;assert.throws(()=>new ScalpTopology(bad),/表面绑定/);
 const floating={...a,scalpPositions:a.scalpPositions.slice()};floating.scalpPositions[5]+=.1;assert.throws(()=>new ScalpTopology(floating),/贴合/);
});
