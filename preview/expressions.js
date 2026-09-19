import {CameraZoom} from './core/input/CameraZoom.js';
import {bindCameraZoom,bindZoomButtons} from './camera-zoom.js';
import {createCharacter,ellipsoid} from './core/character/CharacterGeometry.js';
import {GeometryBuffer} from './core/hair/HairGeometry.js';
import {HeadRaycast} from './core/surface/HeadRaycast.js';
import {FaceExpressionController,FACE_EMOTIONS} from './core/character/FaceExpressionController.js';
import {makeAtlas,expressions,ATLAS_COLUMNS,ATLAS_ROWS,BROW_FRAME} from './expression-art.js';
const status=document.querySelector('#status');
const response=await fetch('/test-heads.json');if(!response.ok)throw new Error('头模加载失败');
const originalModels=(await response.json()).models;
const userResponse=await fetch('/user-head.json');if(!userResponse.ok)throw new Error('用户头模加载失败');
const models=[await userResponse.json(),originalModels[0]],atlas=makeAtlas();
let modelIndex=0,expression=0,yaw=0,pitch=0,rotateMode=false;
const zoom=new CameraZoom();
const face=new FaceExpressionController();
const bodyImage=new Image();bodyImage.src='/user-body.jpg';await bodyImage.decode();
function createView(id,hybrid){
 const canvas=document.getElementById(id),gl=canvas.getContext('webgl',{antialias:true,alpha:false});
 if(!gl)throw new Error('WebGL 不可用');
 const compile=(type,source)=>{const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(s));return s;};
 const program=gl.createProgram();
 gl.attachShader(program,compile(gl.VERTEX_SHADER,`attribute vec3 aPosition;attribute vec4 aColor;attribute vec2 aUV;varying vec2 vUV;varying vec4 vColor;varying vec3 vLocal;
 uniform vec2 uFraming;uniform float uYaw,uPitch,uAspect;uniform mediump float uEye;uniform mediump vec2 uGaze;uniform mediump vec3 uEyeCenter;
 void main(){vUV=aUV;vec3 local=aPosition;
 if(uEye>.5){vec3 e=local-uEyeCenter;float cy=cos(uGaze.x*.38),sy=sin(uGaze.x*.38),cp=cos(-uGaze.y*.28),sp=sin(-uGaze.y*.28);
 vec3 a=vec3(cy*e.x+sy*e.z,e.y,-sy*e.x+cy*e.z);local=vec3(a.x,cp*a.y-sp*a.z,sp*a.y+cp*a.z)+uEyeCenter;}
 vLocal=local;vColor=aColor;
 vec3 a=local-vec3(0.,1.65,0.);float c=cos(uYaw),s=sin(uYaw),cp=cos(uPitch),sp=sin(uPitch);
 vec3 r=vec3(c*a.x+s*a.z,a.y,-s*a.x+c*a.z);vec3 p=vec3(r.x,cp*r.y-sp*r.z,sp*r.y+cp*r.z);p.y+=1.65-uFraming.x;p.z-=uFraming.y;
 float f=3.3759;gl_Position=vec4(p.x*f/uAspect,p.y*f,-1.0033389*p.z-.1001669,-p.z);}`));
 gl.attachShader(program,compile(gl.FRAGMENT_SHADER,`precision mediump float;varying vec2 vUV;uniform sampler2D uBody;uniform float uTextured;varying vec4 vColor;varying vec3 vLocal;
 uniform vec4 uLayout;uniform vec2 uEyeScale;uniform sampler2D uAtlas;uniform float uState,uFace,uHybrid,uOpen,uBrowAngle,uBrowHeight,uEye;uniform vec2 uGaze;uniform vec3 uEyeCenter;
 vec4 sampleFrame(vec2 uv,float frame){if(any(lessThan(uv,vec2(0.)))||any(greaterThan(uv,vec2(1.))))return vec4(0.);return texture2D(uAtlas,(clamp(uv,vec2(.002),vec2(.998))+vec2(mod(frame,${ATLAS_COLUMNS.toFixed(1)}),floor(frame/${ATLAS_COLUMNS.toFixed(1)})))/vec2(${ATLAS_COLUMNS.toFixed(1)},${ATLAS_ROWS.toFixed(1)}));}
 void main(){vec3 color=vColor.rgb;if(uTextured>.5)color=mix(texture2D(uBody,vUV).rgb,vec3(.955,.755,.602),smoothstep(1.039,1.1095,vLocal.y))*vColor.a;vec2 uv=vec2(vLocal.x/uLayout.x+.5,(uLayout.y-vLocal.y)/uLayout.z);
 if(uEye>.5){vec2 q=(vLocal.xy-uEyeCenter.xy)/vec2(.113*uEyeScale.x,.084*uEyeScale.y*max(.001,uOpen));if(uOpen<.06||dot(q,q)>1.)discard;}
 if(uFace>.5&&vLocal.z>uLayout.w&&uv.x>0.&&uv.x<1.&&uv.y>0.&&uv.y<1.){
 vec4 ink=vec4(0.);
 if(uv.y<.18){float side=uv.x<.5?1.:-1.;vec2 center=vec2(uv.x<.5?71./256.:185./256.,35./256.);
 vec2 q=uv-center+vec2(0.,uBrowHeight/uLayout.z);float a=uBrowAngle*side;vec2 rotated=vec2(cos(a)*q.x+sin(a)*q.y,-sin(a)*q.x+cos(a)*q.y);ink=sampleFrame(center+rotated,${BROW_FRAME.toFixed(1)});}
 else if(uv.y<.43){
 if(uHybrid<.5){vec2 whiteUV=uv;whiteUV.y=74./256.+(uv.y-74./256.)/max(.001,uOpen);
 vec4 white=sampleFrame(whiteUV,6.);vec4 iris=sampleFrame(uv-vec2(uGaze.x*.038,-uGaze.y*.024),7.);
 ink=vec4(mix(white.rgb,iris.rgb,iris.a),white.a*step(.035,uOpen));}
 vec4 shut=sampleFrame(uv,5.);float lineAlpha=1.-smoothstep(.04,.16,uOpen);ink=mix(ink,shut,lineAlpha);
 }else{ink=sampleFrame(uv,uState);}
 color=mix(color,ink.rgb,ink.a);}
 gl_FragColor=vec4(color,1.);}`));
 gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(program));gl.useProgram(program);gl.enable(gl.DEPTH_TEST);
 const position=gl.getAttribLocation(program,'aPosition'),color=gl.getAttribLocation(program,'aColor');gl.enableVertexAttribArray(position);gl.enableVertexAttribArray(color);
 const uniforms={};for(const key of ['uTextured','uFraming','uLayout','uEyeScale','uYaw','uPitch','uAspect','uEye','uEyeCenter','uGaze','uOpen','uBrowAngle','uBrowHeight','uState','uFace','uHybrid'])uniforms[key]=gl.getUniformLocation(program,key);
 const texture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,texture);gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,false);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,atlas);
 gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
 const uvAttribute=gl.getAttribLocation(program,'aUV');
 const bodyTexture=gl.createTexture();gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,bodyTexture);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,bodyImage);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.generateMipmap(gl.TEXTURE_2D);gl.uniform1i(gl.getUniformLocation(program,'uBody'),1);gl.activeTexture(gl.TEXTURE0);
 let texturedHead=false;
 let framing=[1.65,3.3];
 let objects=[],layout={width:.95,top:2.03,height:1.02,front:.23};
 function upload(g,eye=false,center=[0,0,0]){const view=g.finish(),obj={count:g.count,eye,center,p:gl.createBuffer(),c:gl.createBuffer(),uv:gl.createBuffer(),hasUV:!!view.uvs};if(view.uvs){gl.bindBuffer(gl.ARRAY_BUFFER,obj.uv);gl.bufferData(gl.ARRAY_BUFFER,view.uvs,gl.STATIC_DRAW);}gl.bindBuffer(gl.ARRAY_BUFFER,obj.p);gl.bufferData(gl.ARRAY_BUFFER,view.positions,gl.STATIC_DRAW);gl.bindBuffer(gl.ARRAY_BUFFER,obj.c);gl.bufferData(gl.ARRAY_BUFFER,view.colors,gl.STATIC_DRAW);objects.push(obj);}
 function setModel(model){
  texturedHead=!!model.characterMesh?.uvs;
  framing=model.characterMesh?[1.22,4.9]:[1.65,3.3];
  layout=model.faceLayout||{width:.95,top:2.03,height:1.02,front:.23};
  for(const o of objects){gl.deleteBuffer(o.p);gl.deleteBuffer(o.c);gl.deleteBuffer(o.uv);}objects=[];upload(createCharacter(model,false,false));
  if(hybrid){const raycast=new HeadRaycast(model);
   const sx=layout.width/.95,sy=layout.height/1.02,eyeY=layout.top-74/256*layout.height;
   for(const sign of [-1,1]){const x=sign*57/256*layout.width,depth=raycast.distance({ox:x,oy:eyeY,oz:3,dx:0,dy:0,dz:-1},0),z=3-depth;
    const g=new GeometryBuffer(5000);ellipsoid(g,x,eyeY,z+.006,.113*sx,.084*sy,.026,[.30,.23,.18],24,12);ellipsoid(g,x,eyeY,z+.009,.110*sx,.081*sy,.026,[.98,.985,.99],24,12);ellipsoid(g,x,eyeY,z+.037,.0155*sx,.0183*sy,.006,[.07,.065,.06],20,12);upload(g,true,[x,eyeY,z+.006]);
   }
  }
 }
 function draw(){
  const dpr=Math.min(devicePixelRatio,2),rect=canvas.getBoundingClientRect(),w=Math.round(rect.width*dpr),h=Math.round(rect.height*dpr);if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}
  gl.uniform2f(uniforms.uFraming,framing[0]+(1.65-framing[0])*Math.max(0,(1-zoom.factor)/.45),framing[1]*zoom.factor);
  gl.uniform4f(uniforms.uLayout,layout.width,layout.top,layout.height,layout.front);gl.uniform2f(uniforms.uEyeScale,layout.width/.95,layout.height/1.02);
  gl.viewport(0,0,w,h);gl.clearColor(.957,.941,.910,1);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);gl.uniform1f(uniforms.uYaw,yaw);gl.uniform1f(uniforms.uPitch,pitch);gl.uniform1f(uniforms.uAspect,w/h);gl.uniform1f(uniforms.uHybrid,hybrid?1:0);gl.uniform1f(uniforms.uState,face.mouthFrame);gl.uniform2f(uniforms.uGaze,face.gazeX,face.gazeY);gl.uniform1f(uniforms.uOpen,face.openness);gl.uniform1f(uniforms.uBrowAngle,face.browAngle);gl.uniform1f(uniforms.uBrowHeight,face.browHeight);
  for(const o of objects){
   const textured=texturedHead&&!o.eye&&o.hasUV;gl.uniform1f(uniforms.uTextured,textured?1:0);if(textured){gl.enableVertexAttribArray(uvAttribute);gl.bindBuffer(gl.ARRAY_BUFFER,o.uv);gl.vertexAttribPointer(uvAttribute,2,gl.FLOAT,false,0,0);}else{gl.disableVertexAttribArray(uvAttribute);gl.vertexAttrib2f(uvAttribute,0,0);}
   gl.uniform1f(uniforms.uEye,o.eye?1:0);gl.uniform3fv(uniforms.uEyeCenter,o.center);gl.uniform1f(uniforms.uFace,o.eye?0:1);gl.bindBuffer(gl.ARRAY_BUFFER,o.p);gl.vertexAttribPointer(position,3,gl.FLOAT,false,0,0);gl.bindBuffer(gl.ARRAY_BUFFER,o.c);gl.vertexAttribPointer(color,4,gl.FLOAT,false,0,0);gl.drawArrays(gl.TRIANGLES,0,o.count);
  }
 }
 let pointer=null,lastX=0,lastY=0;
 const cancelSingle=()=>{pointer=null;face.releaseLook();};
 bindCameraZoom(canvas,zoom,cancelSingle,render);
 canvas.addEventListener('pointerdown',e=>{if(pointer!==null||e.button!==0)return;pointer=e.pointerId;lastX=e.clientX;lastY=e.clientY;canvas.setPointerCapture(pointer);track(e);});
 function track(e){const rect=canvas.getBoundingClientRect(),radius=rect.height*.6*3.3759/(2*framing[1]*zoom.factor),cy=rect.top+rect.height*.5-(1.65-framing[0])*(1-Math.max(0,(1-zoom.factor)/.45))*3.3759/(framing[1]*zoom.factor)*rect.height*.5;face.lookAtScreen((e.clientX-rect.left-rect.width*.5)/radius,-(e.clientY-cy)/radius,yaw,pitch);}
 canvas.addEventListener('pointermove',e=>{
  if(rotateMode){if(e.pointerId!==pointer)return;yaw+=(e.clientX-lastX)*.009;pitch=Math.max(-.55,Math.min(.55,pitch+(e.clientY-lastY)*.008));lastX=e.clientX;lastY=e.clientY;face.releaseLook();render();}
  else if(e.pointerType==='mouse'||e.pointerId===pointer)track(e);
 });
 for(const event of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(event,()=>{pointer=null;face.releaseLook();});
 canvas.addEventListener('pointerleave',()=>{if(pointer===null)face.releaseLook();});
 return {setModel,draw,canvas,cancelSingle};
}
const views=[createView('flat',false),createView('hybrid',true)];
bindZoomButtons(zoom,render,()=>{for(const view of views)view.cancelSingle();});
let statusEmotion=-1,statusYaw=NaN,statusPitch=NaN;
function render(){for(const view of views)view.draw();const y=Math.round(yaw*180/Math.PI),p=Math.round(pitch*180/Math.PI);if(statusEmotion!==expression||statusYaw!==y||statusPitch!==p){statusEmotion=expression;statusYaw=y;statusPitch=p;status.textContent=`${expressions[expression]} · 转向 ${y}° · 俯仰 ${p}°`;}}
for(const button of document.querySelectorAll('[data-expression]'))button.onclick=()=>{const next=Number(button.dataset.expression);if(next===expression)return;expression=next;face.setEmotion(FACE_EMOTIONS[next]);for(const b of document.querySelectorAll('[data-expression]'))b.setAttribute('aria-pressed',String(b===button));render();};
document.querySelector('#head').onchange=e=>{modelIndex=Number(e.target.value);for(const view of views)view.setModel(models[modelIndex]);render();};
for(const [id,angle] of [['front',0],['side',Math.PI/2],['back',Math.PI]])document.getElementById(id).onclick=()=>{yaw=angle;pitch=0;face.suspend();render();};
document.querySelector('#blink').onclick=()=>face.blinkNow();
for(const [id,rotate] of [['lookMode',false],['rotateMode',true]])document.getElementById(id).onclick=()=>{rotateMode=rotate;face.releaseLook();document.getElementById('lookMode').setAttribute('aria-pressed',String(!rotate));document.getElementById('rotateMode').setAttribute('aria-pressed',String(rotate));};
for(const view of views){view.setModel(models[modelIndex]);new ResizeObserver(render).observe(view.canvas);}render();
let frameId=0,previous=0;
function tick(now){if(document.hidden)return;if(!previous||now-previous>=1000/30){const dt=previous?(now-previous)/1000:0;previous=now;if(face.update(dt))render();}frameId=requestAnimationFrame(tick);}
frameId=requestAnimationFrame(tick);
document.addEventListener('visibilitychange',()=>{cancelAnimationFrame(frameId);face.suspend();previous=0;if(!document.hidden){render();frameId=requestAnimationFrame(tick);}});
