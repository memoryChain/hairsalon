const {test}=require('node:test');
const assert=require('node:assert/strict');
const library=require('../assets/resources/scalp/test-heads.json');
const {HAIR_STYLES,HAIR_PRESETS,cycleStyle}=require('../.cache/test-core/core/HairstyleCatalog');
const {SurfaceHairSimulation}=require('../.cache/test-core/surface/SurfaceHairSimulation');
const {SurfaceHairGeometry}=require('../.cache/test-core/surface/SurfaceHairGeometry');
const {StrokePlaneCutter}=require('../.cache/test-core/surface/StrokePlaneCutter');
const projection={project(x,y,z,o){o.depth=6-z;o.x=300+x/o.depth*600;o.y=300+(y-1.65)/o.depth*600;},rayAt(x,y,o){const dx=(x-300)/600,dy=(y-300)/600,n=Math.hypot(dx,dy,1);Object.assign(o,{ox:0,oy:1.65,oz:6,dx:dx/n,dy:dy/n,dz:-1/n});}};
function closed(m){const edges=new Map();for(let f=0;f<m.indices.length;f+=3)for(let j=0;j<3;j++){const a=m.indices[f+j],b=m.indices[f+(j+1)%3],key=a<b?a+':'+b:b+':'+a,e=edges.get(key)||[0,0];e[0]++;e[1]+=a<b?1:-1;edges.set(key,e);}for(const e of edges.values())assert.deepEqual(e,[2,0]);}
test('十二款发型切换循环完整，造型坐标各不相同',()=>{
 assert.equal(HAIR_STYLES.length,12);assert.equal(new Set(HAIR_STYLES).size,12);
 assert.equal(cycleStyle('spiky',-1),'combover');assert.equal(cycleStyle('combover',1),'spiky');
 const s=new SurfaceHairSimulation(library.models[0]),signatures=new Set();
 for(const style of HAIR_STYLES){s.reset(style);signatures.add(JSON.stringify(Array.from(s.fiberMesh.evaluate(s))));assert.ok(HAIR_PRESETS[style].name);}
 assert.equal(signatures.size,12,'不能只是换名称或发色');
});
for(const asset of [require('../assets/resources/scalp/user-head.json'),...library.models])for(const style of HAIR_STYLES)test(asset.id+' '+style+'：完整根域、惯性稳定、斜切闭合、全剃及恢复',()=>{
 const s=new SurfaceHairSimulation(asset);s.reset(style);const g=new SurfaceHairGeometry();
 const original=Array.from(s.fiberMesh.evaluate(s));closed(s.fiberMesh);
 assert.equal(s.topology.area.length,asset.scalpIndices.length/3);
 for(const fiber of s.fiberRig.fibers)for(let j=0;j<fiber.ids.length;j++)for(let a=0;a<3;a++)assert.ok(Math.abs(s.fiberRig.positions[(fiber.base+j)*3+a]-s.topology.roots[fiber.ids[j]*3+a])<1e-10,'每个发根必须严格绑定输入头皮');
 assert.ok(original.every(v=>Number.isFinite(v)&&Math.abs(v)<10));
 s.dragTurn(.6,.2);for(let i=0;i<90;i++)s.advance(1/60);
 g.update(s);assert.ok(g.count<=g.capacity);assert.ok(s.p.every(Number.isFinite));assert.ok(g.colors.subarray(0,g.count*4).every(Number.isFinite));
 s.reset(style);const cutter=new StrokePlaneCutter();let cut=false;
 for(const yaw of [0,Math.PI/2,Math.PI]){if(cut)break;s.dragTurn(yaw-s.yaw,0);for(let y=480;y>=180&&!cut;y-=3){cutter.begin();cut=cutter.sweep(s,projection,160,y,440,y-12,5);}}
 if(style==='bald'){assert.equal(cut,false);assert.equal(s.fiberMesh.indices.length,0);}else{assert.ok(cut,'有发造型必须可剪');closed(s.cutMesh);assert.ok(s.debris.length>0);}
 s.trim(new Float64Array(s.lengths.length));s.debris.length=0;g.update(s);assert.equal(g.count,0);assert.equal(s.shavedFaces,s.topology.area.length);
 s.reset();assert.equal(s.style,style);assert.equal(s.cuts,0);assert.deepEqual(Array.from(s.fiberMesh.evaluate(s)),original);
});
