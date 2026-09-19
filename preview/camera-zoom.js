import {CameraZoom} from './core/input/CameraZoom.js';
export function bindCameraZoom(canvas, zoom, cancelSingle, changed) {
 const update=action=>{const before=zoom.factor;action();if(before!==zoom.factor)changed();};
 canvas.addEventListener('wheel',e=>{
  e.preventDefault();cancelSingle();
  update(()=>zoom.wheel(e.deltaY*(e.deltaMode===1?16:e.deltaMode===2?canvas.clientHeight:1)));
 },{passive:false});
 canvas.addEventListener('pointerdown',e=>{
  if(e.pointerType!=='touch')return;
  canvas.setPointerCapture(e.pointerId);
  if(zoom.down(e.pointerId,e.clientX,e.clientY)){cancelSingle();e.stopImmediatePropagation();}
 },true);
 canvas.addEventListener('pointermove',e=>{
  if(e.pointerType!=='touch')return;
  let consumed;update(()=>{consumed=zoom.move(e.pointerId,e.clientX,e.clientY);});
  if(consumed)e.stopImmediatePropagation();
 },true);
 for(const name of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(name,e=>{
  if(e.pointerType==='touch'&&zoom.up(e.pointerId)){cancelSingle();e.stopImmediatePropagation();}
 },true);
 window.addEventListener('blur',()=>{zoom.cancel();cancelSingle();});
 document.addEventListener('visibilitychange',()=>{if(document.hidden){zoom.cancel();cancelSingle();}});
}
export function bindZoomButtons(zoom, changed, cancelSingle) {
 for(const [id,ratio] of [['zoomIn',.85],['zoomOut',1/.85],['zoomReset',0]])document.getElementById(id).onclick=()=>{
  cancelSingle();const before=zoom.factor;if(ratio)zoom.scale(ratio);else zoom.set(1);if(before!==zoom.factor)changed();
 };
}
