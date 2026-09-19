const {test}=require('node:test');
const assert=require('node:assert/strict');
const models=require('../assets/resources/scalp/test-heads.json').models;
const {SurfaceHairSimulation}=require('../.cache/test-core/surface/SurfaceHairSimulation');
const {SurfaceHairGeometry}=require('../.cache/test-core/surface/SurfaceHairGeometry');
const {partitionRoots}=require('../.cache/test-core/surface/FiberLayout');
const {StrokePlaneCutter}=require('../.cache/test-core/surface/StrokePlaneCutter');
const projection={project(x,y,z,o){o.depth=6-z;o.x=300+x/o.depth*600;o.y=300+(y-1.65)/o.depth*600;},rayAt(x,y,o){const dx=(x-300)/600,dy=(y-300)/600,n=Math.hypot(dx,dy,1);Object.assign(o,{ox:0,oy:1.65,oz:6,dx:dx/n,dy:dy/n,dz:-1/n});}};
function closed(m){const e=new Map();for(let f=0;f<m.indices.length;f+=3)for(let j=0;j<3;j++){const a=m.indices[f+j],b=m.indices[f+(j+1)%3],key=a<b?a+':'+b:b+':'+a,p=e.get(key)||[0,0];p[0]++;p[1]+=a<b?1:-1;e.set(key,p);}for(const p of e.values())assert.deepEqual(p,[2,0]);}
for(const model of models)for(const style of ['spiky','bob'])test(model.id+' '+style+'：非均匀发束完整覆盖根域，多刀、转动及全剃不残留',()=>{
 const s=new SurfaceHairSimulation(model);const originalCount=s.topology.area.length/2;s.reset(style);
 const cells=partitionRoots(s),coverage=new Uint8Array(s.topology.area.length);assert.ok(cells.length<originalCount*.6);
 assert.ok(new Set(cells.map(c=>c.faces.length)).size>=3,'大中小根区都应存在');
 for(const c of cells){assert.equal(new Set(c.boundary).size,c.boundary.length);for(const f of c.faces){coverage[f]++;for(let j=0;j<3;j++)assert.ok(c.boundary.includes(s.topology.triangles[f*3+j]));}}
 assert.ok(coverage.every(n=>n===1));closed(s.fiberMesh);
 const cutter=new StrokePlaneCutter(),g=new SurfaceHairGeometry();let successes=0;
 for(let k=0;k<12;k++){cutter.begin();const y=style==='spiky'?445-k*3:310+k*3;if(cutter.sweep(s,projection,160,y,440,y-24,5))successes++;s.dragTurn(.03,.008);s.advance(1/60);g.update(s);assert.ok(g.count<=g.capacity);assert.ok(g.view.colors.every(Number.isFinite));if(s.cutMesh)closed(s.cutMesh);}
 assert.ok(successes>=2);s.trim(new Float64Array(s.lengths.length));s.debris.length=0;g.update(s);assert.equal(g.count,0);
 s.reset(style);assert.equal(s.fiberRig.fibers.length,cells.length);g.update(s);assert.ok(g.count>0);
});

for(const model of models)for(const style of ['long','crop','mohawk','quiff','sidepart','lob','asymmetric','flipped'])test(model.id+' '+style+'：精修分区无遗漏、闭合且面数受控',()=>{
 const s=new SurfaceHairSimulation(model);s.reset(style);
 const cells=partitionRoots(s),coverage=new Uint8Array(s.topology.area.length);
 assert.ok(cells.length<s.topology.area.length*.25,'合并细条为不同大小的发束');
 assert.ok(new Set(cells.map(c=>c.faces.length)).size>=3);
 for(const c of cells)for(const f of c.faces)coverage[f]++;
 assert.ok(coverage.every(n=>n===1),'每个根面只能归属一个发束');
 assert.equal(s.fiberRig.levels.length,6);closed(s.fiberMesh);
 assert.ok(s.fiberMesh.indices.length/3<14000,'初始发体三角面预算');
 const g=new SurfaceHairGeometry();g.update(s);
 assert.ok(g.view.colors.every(Number.isFinite));assert.ok(g.count<=g.capacity);
});
