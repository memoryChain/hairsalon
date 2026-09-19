const {test}=require('node:test');
const assert=require('node:assert/strict');
const models=require('../assets/resources/scalp/test-heads.json').models;
const {createCharacter}=require('../.cache/test-core/character/CharacterGeometry');
const {HeadRaycast}=require('../.cache/test-core/surface/HeadRaycast');
test('标准头型主体超过一万面，耳部独立闭合，原头皮根顶点不偏移',()=>{
 const m=models[0],p=m.headPositions,ix=m.headIndices,n=p.length/3,parent=Array.from({length:n},(_,i)=>i),edges=new Map();
 const root=i=>{while(parent[i]!==i){parent[i]=parent[parent[i]];i=parent[i];}return i;};
 for(let f=0;f<ix.length;f+=3){
  for(let j=0;j<3;j++){const a=ix[f+j],b=ix[f+(j+1)%3];parent[root(a)]=root(b);const key=a<b?a+':'+b:b+':'+a,e=edges.get(key)||[0,0];e[0]++;e[1]+=a<b?1:-1;edges.set(key,e);}
  const a=ix[f]*3,b=ix[f+1]*3,c=ix[f+2]*3,ux=p[b]-p[a],uy=p[b+1]-p[a+1],uz=p[b+2]-p[a+2],vx=p[c]-p[a],vy=p[c+1]-p[a+1],vz=p[c+2]-p[a+2];
  assert.ok(Math.hypot(uy*vz-uz*vy,uz*vx-ux*vz,ux*vy-uy*vx)>1e-10);
 }
 for(const edge of edges.values())assert.deepEqual(edge,[2,0]);
 const counts=new Map();for(let f=0;f<ix.length;f+=3){const key=root(ix[f]);counts.set(key,(counts.get(key)||0)+1);}
 assert.ok(Math.max(...counts.values())>=10000);assert.equal(counts.size,3);
 assert.equal(m.scalpPositions.length/3,321);assert.equal(m.scalpIndices.length/3,608);
 for(let i=0;i<m.scalpHeadVertexIds.length;i++)for(let a=0;a<3;a++)assert.equal(p[m.scalpHeadVertexIds[i]*3+a],m.scalpPositions[i*3+a]);
 assert.equal(m.headNormals.length,p.length);for(let k=0;k<p.length;k+=3)assert.ok(Math.abs(Math.hypot(...m.headNormals.slice(k,k+3))-1)<1e-5);
});
test('鼻梁鼻尖属于头部表面；细致头模和旧非标准头型使用同容量角色缓冲',()=>{
 const m=models[0],ray=new HeadRaycast(m),front=(x,y)=>3-ray.distance({ox:x,oy:y,oz:3,dx:0,dy:0,dz:-1},0);
 assert.ok(front(0,1.52)>front(.20,1.52)+.08);assert.ok(front(0,1.68)>front(.18,1.68)+.03);
 let capacity=0;for(const index of [0,1,0,1]){const g=createCharacter(models[index],false);assert.ok(g.count<g.capacity);assert.ok(g.view.positions.every(Number.isFinite));if(capacity)assert.equal(g.capacity,capacity);capacity=g.capacity;}
});
