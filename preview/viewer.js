import {CameraZoom} from './core/input/CameraZoom.js';
import {bindCameraZoom,bindZoomButtons} from './camera-zoom.js';
import { FaceGeometry } from './core/character/FaceGeometry.js';
import { FaceExpressionController, FACE_EMOTIONS } from './core/character/FaceExpressionController.js';
import { cycleStyle, styleTitle } from './core/core/HairstyleCatalog.js';
import { SurfaceHairSimulation } from './core/surface/SurfaceHairSimulation.js';
import { SurfaceHairGeometry } from './core/surface/SurfaceHairGeometry.js';
import { SalonGesture } from './core/surface/SalonGesture.js';
import { createCharacter } from './core/character/CharacterGeometry.js';
import { CONFIG, TOOL_HINTS } from './core/core/PrototypeConfig.js';

const zoom = new CameraZoom();
const canvas = document.querySelector('#stage'), status = document.querySelector('#status');
const gl = canvas.getContext('webgl', { antialias: true, alpha: false });
if (!gl) { status.textContent = '当前浏览器无法创建 WebGL，请检查硬件加速。'; throw new Error('WebGL 不可用'); }
const userResponse = await fetch('/user-head.json'); if(!userResponse.ok)throw new Error('用户头模加载失败');
const userHead = await userResponse.json();
const face = new FaceExpressionController();
const sim = new SurfaceHairSimulation(userHead), hair = new SurfaceHairGeometry();
hair.update(sim);document.getElementById('styleTitle').textContent=styleTitle(sim.style);
function shader(type, source) {
    const s = gl.createShader(type); gl.shaderSource(s, source); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s;
}
const program = gl.createProgram();
gl.attachShader(program, shader(gl.VERTEX_SHADER, `attribute vec3 aPosition; attribute vec4 aColor; attribute vec2 aUV; varying vec2 vUV; varying float vLocalY;
uniform float uCameraZ; uniform float uYaw; uniform float uPitch; uniform vec3 uCenter; uniform float uAspect; varying vec4 vColor;
void main(){vUV=aUV;vLocalY=aPosition.y;float c=cos(uYaw),s=sin(uYaw),cp=cos(uPitch),sp=sin(uPitch);vec3 a=aPosition-uCenter;
vec3 r=vec3(c*a.x+s*a.z,a.y,-s*a.x+c*a.z);vec3 p=vec3(r.x,cp*r.y-sp*r.z,sp*r.y+cp*r.z)+uCenter;
p-=vec3(0.,${CONFIG.cameraY},uCameraZ);float f=1./tan(radians(${CONFIG.fov.toFixed(1)})/2.);
gl_Position=vec4(p.x*f/uAspect,p.y*f,-1.0033389*p.z-0.1001669,-p.z);vColor=aColor;}`));
gl.attachShader(program, shader(gl.FRAGMENT_SHADER, 'precision mediump float; varying vec4 vColor; varying vec2 vUV; varying float vLocalY; uniform sampler2D uBody; uniform float uTextured; void main(){vec3 color=vColor.rgb;if(uTextured>.5)color=mix(texture2D(uBody,vUV).rgb,vec3(.955,.755,.602),smoothstep(1.039,1.1095,vLocalY))*vColor.a;gl_FragColor=vec4(color,1.);}'));
gl.linkProgram(program); if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
gl.useProgram(program); gl.enable(gl.DEPTH_TEST);
const position = gl.getAttribLocation(program, 'aPosition'), color = gl.getAttribLocation(program, 'aColor');
const yawUniform = gl.getUniformLocation(program, 'uYaw'), aspectUniform = gl.getUniformLocation(program, 'uAspect');
const cameraZUniform=gl.getUniformLocation(program,'uCameraZ');
const pitchUniform=gl.getUniformLocation(program,'uPitch'), centerUniform=gl.getUniformLocation(program,'uCenter');
gl.enableVertexAttribArray(position); gl.enableVertexAttribArray(color);
const uvAttribute=gl.getAttribLocation(program,'aUV'),texturedUniform=gl.getUniformLocation(program,'uTextured');
const bodyImage=new Image();bodyImage.src='/user-body.jpg';await bodyImage.decode();
const bodyTexture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,bodyTexture);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,bodyImage);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.generateMipmap(gl.TEXTURE_2D);
function drawable(geometry) {
    const obj = { geometry, position: gl.createBuffer(), color: gl.createBuffer(), uv: gl.createBuffer() };
    gl.bindBuffer(gl.ARRAY_BUFFER, obj.position); gl.bufferData(gl.ARRAY_BUFFER, geometry.positions.byteLength, gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, obj.color); gl.bufferData(gl.ARRAY_BUFFER, geometry.colors.byteLength, gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER,obj.uv);gl.bufferData(gl.ARRAY_BUFFER,geometry.view.uvs ? geometry.capacity*2*4 : 8,gl.DYNAMIC_DRAW);
    upload(obj); return obj;
}
function upload(obj) {
    if(obj.geometry.view.uvs){gl.bindBuffer(gl.ARRAY_BUFFER,obj.uv);gl.bufferSubData(gl.ARRAY_BUFFER,0,obj.geometry.view.uvs);}
    gl.bindBuffer(gl.ARRAY_BUFFER, obj.position); gl.bufferSubData(gl.ARRAY_BUFFER, 0, obj.geometry.finish().positions);
    gl.bindBuffer(gl.ARRAY_BUFFER, obj.color); gl.bufferSubData(gl.ARRAY_BUFFER, 0, obj.geometry.finish().colors);
}
const character = drawable(createCharacter(sim.topology.asset,true,false)), hairDraw = drawable(hair);
const faceGeometry = new FaceGeometry(sim.topology.asset); faceGeometry.update(face);
const faceDraw = drawable(faceGeometry); let faceTime=0;
function draw(obj, yaw, pitch=0) {
    const textured=obj===character&&!!sim.topology.asset.characterMesh?.uvs;gl.uniform1f(texturedUniform,textured?1:0);
    if(textured){gl.enableVertexAttribArray(uvAttribute);gl.bindBuffer(gl.ARRAY_BUFFER,obj.uv);gl.vertexAttribPointer(uvAttribute,2,gl.FLOAT,false,0,0);}else{gl.disableVertexAttribArray(uvAttribute);gl.vertexAttrib2f(uvAttribute,0,0);}
    gl.uniform1f(yawUniform, yaw);gl.uniform1f(pitchUniform,pitch);gl.uniform3fv(centerUniform,sim.topology.asset.center);
    gl.bindBuffer(gl.ARRAY_BUFFER, obj.position); gl.vertexAttribPointer(position, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, obj.color); gl.vertexAttribPointer(color, 4, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLES, 0, obj.geometry.count);
}
let mode = 'cut', pointer = null, left = false, right = false, previous = 0, statusTime = 0;
const cursor = document.querySelector('#cursor'), hint = document.querySelector('#hint');
const rotationZone=document.querySelector("#rotationZone");
let gesture;
function end() { pointer = null; left = right = false; gesture?.cancel(); sim.stop(); }
let renderedRevision = -1;
function syncHair() { hair.update(sim); upload(hairDraw); renderedRevision = sim.revision; }
function toolHint(){return TOOL_HINTS[mode];}
function select(ids, selected) { for (const id of ids) document.getElementById(id).setAttribute('aria-pressed', String(id === selected)); }
for (const [id,delta] of [['previousStyle',-1],['nextStyle',1]]) document.getElementById(id).onclick = () => {
    end(); sim.debugScalp=false;document.getElementById('inspect').setAttribute('aria-pressed','false');
    sim.reset(cycleStyle(sim.style,delta)); hint.textContent=toolHint();
    document.getElementById('styleTitle').textContent=styleTitle(sim.style);syncHair();
};
for (const tool of ['cut', 'comb', 'blow', 'shave']) document.getElementById(tool).onclick = () => {
    if(mode===tool&&!sim.debugScalp)return;
    end();if(sim.debugScalp){sim.debugScalp=false;sim.revision++;document.getElementById('inspect').setAttribute('aria-pressed','false');}
    mode = tool; select(['cut', 'comb', 'blow', 'shave'], tool); cursor.style.display = 'none';
    gesture.feedback=toolHint();hint.textContent=toolHint();
    canvas.style.cursor = tool !== 'rotate' ? 'crosshair' : 'grab';
};
document.getElementById('inspect').onclick=()=>{end();sim.debugScalp=!sim.debugScalp;document.getElementById('inspect').setAttribute('aria-pressed',String(sim.debugScalp));sim.revision++;hint.textContent=sim.debugScalp?'绿色为真实头皮；再次点击查看头皮返回操作。':toolHint();syncHair();};
document.getElementById('reset').onclick = () => { end(); sim.debugScalp=false;document.getElementById('inspect').setAttribute('aria-pressed','false');sim.reset();hint.textContent=toolHint();syncHair(); };
let cutRect = canvas.getBoundingClientRect();
const focal = Math.tan(CONFIG.fov * Math.PI / 360);
const projection = {
    project(x, y, z, out) {
        out.depth = CONFIG.cameraZ*zoom.factor - z;
        out.x = cutRect.left + cutRect.width / 2 + x / out.depth / focal * cutRect.height / 2;
        out.y = cutRect.top + cutRect.height / 2 - (y - CONFIG.cameraY) / out.depth / focal * cutRect.height / 2;
    },
    rayAt(x, y, out) {
        const dx = ((x - cutRect.left) / cutRect.width * 2 - 1) * focal * cutRect.width / cutRect.height;
        const dy = (1 - (y - cutRect.top) / cutRect.height * 2) * focal, n = Math.hypot(dx, dy, 1);
        out.ox = 0; out.oy = CONFIG.cameraY; out.oz = CONFIG.cameraZ*zoom.factor;
        out.dx = dx / n; out.dy = dy / n; out.dz = -1 / n;
    },
};
gesture=new SalonGesture(sim,projection,false);
function updateFeedback(){
    const text=sim.debugScalp?'绿色为真实头皮；选择工具返回操作。':gesture.feedback;
    if(hint.textContent!==text)hint.textContent=text;
}
bindCameraZoom(canvas,zoom,()=>{end();cursor.style.display='none';},()=>{cutRect=canvas.getBoundingClientRect();});
bindZoomButtons(zoom,()=>{cutRect=canvas.getBoundingClientRect();},end);
canvas.addEventListener('pointerdown', e => {
    if(pointer!==null||e.button!==0)return;
    pointer=e.pointerId;canvas.setPointerCapture(pointer);cutRect=canvas.getBoundingClientRect();left=right=false;
    trackFace(e);gesture.begin(e.clientX,e.clientY,mode);updateFeedback();
});
function trackFace(e){const rect=canvas.getBoundingClientRect();const center={x:0,y:0,depth:0},edge={x:0,y:0,depth:0};projection.project(0,1.65,0,center);projection.project(.6,1.65,0,edge);const radius=Math.max(1,edge.x-center.x);face.lookAtScreen((e.clientX-center.x)/radius,(center.y-e.clientY)/radius,sim.yaw,sim.pitch);}
canvas.addEventListener('pointermove', e => {
    trackFace(e);
    const rect=canvas.getBoundingClientRect();cursor.style.left=`${e.clientX-rect.left}px`;cursor.style.top=`${e.clientY-rect.top}px`;
    cutRect=rect;const rotating=gesture.action==='rotate'||(gesture.action==='idle'&&gesture.isRotationArea(e.clientY)&&!gesture.hitsHair(e.clientX,e.clientY));
    cursor.style.display=mode!=='rotate'&&!rotating?'block':'none';cursor.style.width=cursor.style.height=mode==='shave'?`${CONFIG.shaveRadiusPixels*2}px`:mode==='comb'?'48px':mode==='blow'?'92px':'20px';
    canvas.style.cursor=rotating?'grab':mode==='rotate'?'default':'crosshair';
    if(e.pointerId!==pointer)return;
    cutRect=rect;gesture.move(e.clientX,e.clientY);updateFeedback();
});
canvas.addEventListener('pointerup', e => {
    if(e.pointerId!==pointer)return;
    cutRect=canvas.getBoundingClientRect();gesture.end(e.clientX,e.clientY);pointer=null;updateFeedback();syncHair();
});
canvas.addEventListener('pointercancel',e=>{if(e.pointerId===pointer)end();});canvas.addEventListener('lostpointercapture',()=>{if(pointer!==null)end();});
canvas.addEventListener('pointerleave', () => { cursor.style.display = 'none'; });
window.addEventListener('keydown', e => {
    if (e.target instanceof HTMLButtonElement) return;
    if (e.code === 'KeyE') face.setEmotion(FACE_EMOTIONS[(face.mouthFrame+1)%FACE_EMOTIONS.length]);
    if (e.code === 'KeyA') left = true; if (e.code === 'KeyD') right = true;
    if (e.code === 'Space') { e.preventDefault(); end(); }
});
window.addEventListener('keyup', e => { if (e.code === 'KeyA') left = false; if (e.code === 'KeyD') right = false; if (!left && !right) sim.stop(); });
window.addEventListener('blur', end);
document.addEventListener('visibilitychange', () => { end(); face.suspend(); sim.clearVelocity(); previous = 0; });
canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); sim.paused = true; status.textContent = '图形上下文已丢失，请刷新页面。'; status.classList.add('error'); });
new ResizeObserver(() => {
    const ratio = Math.min(devicePixelRatio, 2), rect = canvas.getBoundingClientRect();
    cutRect=rect;rotationZone.style.top=`${gesture.rotationBoundary()-rect.top}px`;
    canvas.width = Math.round(rect.width * ratio); canvas.height = Math.round(rect.height * ratio);
}).observe(canvas);
function frame(time) {
    const dt = previous ? Math.min((time - previous) / 1000, 0.0667) : 0; previous = time;
    gesture.update(dt);
    faceTime+=dt;if(faceTime>=1/30){if(face.update(faceTime)){faceGeometry.update(face);upload(faceDraw);}faceTime=0;}
    if (left !== right) sim.turn((left ? -1 : 1) * dt * 1.7);
    if (sim.advance(dt) || renderedRevision !== sim.revision) syncHair();
    gl.viewport(0, 0, canvas.width, canvas.height); gl.clearColor(0.914, 0.894, 0.855, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.uniform1f(aspectUniform, canvas.width / canvas.height); gl.uniform1f(cameraZUniform, CONFIG.cameraZ*zoom.factor); draw(character, sim.yaw, sim.pitch); draw(faceDraw, sim.yaw, sim.pitch); draw(hairDraw, 0);
    statusTime += dt;
    if (statusTime > 0.2 && !sim.paused) {
        statusTime = 0;
        const text = `发缕 ${sim.fiberRig.fibers.length} · 根面 ${sim.topology.area.length} · 无发 ${sim.shavedFaces} 根面 · 修剪 ${sim.cuts} 次\n角色 ${(sim.topology.asset.characterMesh?.indices.length ?? sim.topology.asset.headIndices.length) / 3} 面 · 头发/碎发 ${Math.round(hair.count / 3)} 面 · 朝向 ${Math.round(sim.yaw * 180 / Math.PI)}° · 俯仰 ${Math.round(sim.pitch*180/Math.PI)}°`;
        if (status.textContent !== text) status.textContent = text;
    }
    requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
