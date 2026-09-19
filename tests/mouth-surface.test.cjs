const {test}=require('node:test');
const assert=require('node:assert/strict');
const {FaceGeometry}=require('../.cache/test-core/character/FaceGeometry');
const {FaceExpressionController,FACE_EMOTIONS}=require('../.cache/test-core/character/FaceExpressionController');
const {HeadRaycast}=require('../.cache/test-core/surface/HeadRaycast');
const models=[require('../assets/resources/scalp/user-head.json'),...require('../assets/resources/scalp/test-heads.json').models];
for(const h of models)test(h.id+'：所有嘴型贴合可见脸部，面内不悬浮或穿入',()=>{
 const m=h.characterMesh,raycast=new HeadRaycast(m?{...h,headPositions:m.positions,headIndices:m.indices,headNormals:m.normals}:h);
 const g=new FaceGeometry(h),f=new FaceExpressionController(),buffer=g.positions;
 const mouthY=(h.faceLayout?.top??2.03)-150/256*(h.faceLayout?.height??1.02);
 for(const emotion of FACE_EMOTIONS){
  f.setEmotion(emotion);g.update(f);assert.equal(g.positions,buffer);assert.ok(g.count<g.capacity);let samples=0;
  for(let i=0;i<g.count;i+=3){if(g.positions[i*3+1]>mouthY)continue;
   for(const w of [[1,0,0],[0,1,0],[0,0,1],[1/3,1/3,1/3],[.6,.2,.2],[.2,.6,.2],[.2,.2,.6]]){
    const p=[0,0,0];for(let j=0;j<3;j++)for(let a=0;a<3;a++)p[a]+=g.positions[(i+j)*3+a]*w[j];
    const surface=3-raycast.distance({ox:p[0],oy:p[1],oz:3,dx:0,dy:0,dz:-1},0),gap=p[2]-surface;
    assert.ok(gap>0&&gap<.0035,JSON.stringify({emotion,gap}));samples++;
   }
  }
  assert.ok(samples>0);
 }
});
