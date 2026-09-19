// 启动时生成一次矢量占位图集，按原模型的眼白、黑点瞳孔和小嘴比例绘制。
export const ATLAS_COLUMNS=3,ATLAS_ROWS=3,BROW_FRAME=8;
export const expressions=['平静','开心','惊讶','生气','难过哭泣','闭眼'];
export function makeAtlas(){
 const canvas=document.createElement('canvas');canvas.width=256*ATLAS_COLUMNS;canvas.height=256*ATLAS_ROWS;
 const c=canvas.getContext('2d');
 const ellipse=(x,y,rx,ry,color)=>{c.beginPath();c.ellipse(x,y,rx,ry,0,0,Math.PI*2);c.fillStyle=color;c.fill();};
 const line=(points,color,width)=>{c.beginPath();c.moveTo(points[0],points[1]);if(points.length===6)c.quadraticCurveTo(...points.slice(2));else c.lineTo(...points.slice(2));c.strokeStyle=color;c.lineWidth=width;c.lineCap='round';c.stroke();};
 const eye=x=>{ellipse(x,74,27.7,21.7,'#4d3b2e');ellipse(x,74,27,21,'#fafbfc');};
 for(let state=0;state<9;state++){
  c.save();c.translate((state%ATLAS_COLUMNS)*256,Math.floor(state/ATLAS_COLUMNS)*256);
  if(state>=5){
   for(const x of [71,185]){
    if(state===5)line([x-24,76,x,80,x+24,76],'#4d3b2e',1.6);
    else if(state===6)eye(x);
    else if(state===7)ellipse(x,74,3.8,4.6,'#12110f');
    else if(state===BROW_FRAME)line([x-24,35,x,29,x+24,35],'#4d3b2e',1.6);
   }
   c.restore();continue;
  }
  if(state===2){ellipse(128,189,8.5,13,'#8f5233');ellipse(128,189,7,11,'#3d1d0f');}
  else if(state===1)line([110,189,128,203,146,189],'#3d1d0f',3);
  else if(state===3)line([110,189,128,183,146,189],'#3d1d0f',2.5);
  else if(state===4)line([110,189,128,173,146,189],'#3d1d0f',2.5);
  else{ellipse(128,189,17,4.4,'#8f5233');ellipse(128,189,15.8,2.8,'#3d1d0f');}
  c.restore();
 }
 return canvas;
}
