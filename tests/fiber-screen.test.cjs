const {test}=require('node:test');
const assert=require('node:assert/strict');
const library=require('../assets/resources/scalp/test-heads.json');
const {SurfaceHairSimulation}=require('../.cache/test-core/surface/SurfaceHairSimulation');
const {SurfaceHairGeometry}=require('../.cache/test-core/surface/SurfaceHairGeometry');
const {FiberScreenCutter}=require('../.cache/test-core/surface/FiberScreenCutter');
const {SalonGesture}=require('../.cache/test-core/surface/SalonGesture');
const projection={project(x,y,z,o){o.depth=6-z;o.x=300+x/o.depth*600;o.y=300+(y-1.65)/o.depth*600;},rayAt(x,y,o){const dx=(x-300)/600,dy=(y-300)/600,n=Math.hypot(dx,dy,1);Object.assign(o,{ox:0,oy:1.65,oz:6,dx:dx/n,dy:dy/n,dz:-1/n});}};
function closed(m){const edges=new Map();for(let f=0;f<m.indices.length;f+=3)for(let j=0;j<3;j++){const a=m.indices[f+j],b=m.indices[f+(j+1)%3],key=a<b?a+':'+b:b+':'+a;const edge=edges.get(key)||[0,0];edge[0]++;edge[1]+=a<b?1:-1;edges.set(key,edge);}for(const edge of edges.values())assert.deepEqual(edge,[2,0],'两侧封口须闭合且绕序一致');}
function volume(p,ix){let v=0;for(let f=0;f<ix.length;f+=3){const a=ix[f]*3,b=ix[f+1]*3,c=ix[f+2]*3;v+=(p[a]*(p[b+1]*p[c+2]-p[b+2]*p[c+1])+p[a+1]*(p[b+2]*p[c]-p[b]*p[c+2])+p[a+2]*(p[b]*p[c+1]-p[b+1]*p[c]))/6;}return v;}
const level=b=>b.levels.reduce((n,t,i)=>n+t*b.weights[i],0);
for(const model of library.models)for(const style of ['spiky','long'])test(model.id+' '+style+'：扫过当前发缕即剪，截面封闭、体积与初速度连续，未命中缕不变',()=>{
 const s=new SurfaceHairSimulation(model);s.reset(style);const c=new FiberScreenCutter(),source=s.fiberMesh;
 const before=volume(source.evaluate(s),source.indices),y=style==='spiky'?413:199;
 // 两端均在头发外，整段扫掠也必须命中。
 c.begin();assert.ok(c.sweep(s,projection,175,y,425,y,3));assert.ok(s.cutMesh);closed(s.cutMesh);
 const m=s.cutMesh,p=m.evaluate(s),d=s.debris[0];assert.ok(d&&d.p.length>0);assert.deepEqual(d.p,d.previous,'静止头发剪下时不能产生虚假初速度');
 assert.ok(Math.abs(before-volume(p,m.indices)-volume(d.p,Array.from({length:d.p.length/3},(_,i)=>i)))<1e-9);
 const touched=new Set(d.groups);assert.ok(touched.size>0&&touched.size<s.fiberRig.fibers.length);
 for(let i=0;i<m.bindings.length;i++){
  const b=m.bindings[i];if(b.samples.length===1&&b.sampleWeights[0]===1)for(let axis=0;axis<3;axis++)assert.equal(p[i*3+axis],source.p[b.samples[0]*3+axis]);
 }
 const cuts=s.cuts;assert.equal(c.sweep(s,projection,175,y,425,y,3),false);assert.equal(s.cuts,cuts,'同一次手势不反复削同一缕');c.end();
 s.dragTurn(.4,.2);for(let i=0;i<12;i++)s.advance(1/60);closed(m);assert.ok(m.evaluate(s).every(Number.isFinite));
 const geometry=new SurfaceHairGeometry();geometry.update(s);assert.ok(geometry.count<geometry.capacity);
 s.trim(new Float64Array(s.lengths.length));s.debris.length=0;geometry.update(s);assert.equal(geometry.count,0);
 s.reset();assert.equal(s.cutMesh,null);
});
test('投影剪切遵循头部遮挡、暂停和头皮检查开关；空白扫掠不改变头发',()=>{
 const s=new SurfaceHairSimulation(library.models[0]),c=new FiberScreenCutter();c.begin();
 assert.equal(c.sweep(s,projection,0,600,100,600,10),false);
 const distance=s.occluder.distance;s.occluder.distance=()=>0;assert.equal(c.sweep(s,projection,175,413,425,413,10),false);s.occluder.distance=distance;
 s.paused=true;assert.equal(c.sweep(s,projection,175,413,425,413,10),false);s.paused=false;s.debugScalp=true;assert.equal(c.sweep(s,projection,175,413,425,413,10),false);
 s.debugScalp=false;assert.equal(c.sweep(s,projection,NaN,413,425,413,10),false);assert.equal(s.cutMesh,null);assert.equal(s.cuts,0);
});
test('同一实际滑动在高像素密度、相反屏幕纵轴下剪到相同位置',()=>{
 const a=new SurfaceHairSimulation(library.models[0]),b=new SurfaceHairSimulation(library.models[0]);
 const flipped={project(x,y,z,o){projection.project(x,y,z,o);o.x*=2;o.y=1200-o.y*2;},rayAt(x,y,o){projection.rayAt(x/2,(1200-y)/2,o);}};
 const ga=new SalonGesture(a,projection,true),gb=new SalonGesture(b,flipped,false);
 ga.begin(175,413,'cut',1);gb.begin(350,374,'cut',2);ga.move(425,413);gb.move(850,374);
 assert.ok(a.cuts>0);assert.deepEqual(a.cutMesh.indices,b.cutMesh.indices);
 const p=a.cutMesh.evaluate(a),q=b.cutMesh.evaluate(b);assert.equal(p.length,q.length);for(let i=0;i<p.length;i++)assert.ok(Math.abs(p[i]-q[i])<1e-10);
});
test('不同姿态连续多次剪发保持封口、几何和碎发预算',()=>{
 const s=new SurfaceHairSimulation(library.models[1]);s.reset('long');const c=new FiberScreenCutter(),geometry=new SurfaceHairGeometry();
 for(let i=0;i<25;i++){
  c.begin();c.sweep(s,projection,160,180+i*5,440,180+i*5,6);c.end();
  s.dragTurn(.045,.006);s.advance(1/60);geometry.update(s);
  if(s.cutMesh)closed(s.cutMesh);assert.ok(geometry.count<=geometry.capacity);assert.ok(s.debris.reduce((n,d)=>n+d.p.length/3,0)<=16000);assert.ok(s.debris.length<=12);
 }
 assert.ok(s.cuts>5);for(let i=0;i<310;i++)s.advance(1/60);assert.equal(s.debris.length,0);
});

test('剪点正好经过原始截面环也能封闭，不遗漏环上的切边',()=>{
 const s=new SurfaceHairSimulation(library.models[0]),m=s.fiberMesh,p=m.evaluate(s);let best=-Infinity,id=-1;
 for(let i=0;i<m.bindings.length;i++)if(Math.abs(level(m.bindings[i])-s.fiberRig.levels[1])<1e-10&&p[i*3+1]>best){best=p[i*3+1];id=i;}
 const q={};projection.project(p[id*3],p[id*3+1],p[id*3+2],q);const c=new FiberScreenCutter();c.begin();assert.ok(c.sweep(s,projection,q.x,q.y,q.x,q.y,1e-7));closed(s.cutMesh);
});
