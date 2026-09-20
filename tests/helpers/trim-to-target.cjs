const {PlaneHairCutter}=require('../../.cache/test-core/surface/PlaneHairCutter');
const {applyOrderTarget}=require('../../.cache/test-core/gameplay/HairTarget');

// 测试用可达性检查：实际剪切每缕目标包围平面，不重置、复制或替换玩家网格。
// 自动切面不能证明触屏逐刀复刻的难度，实际手感仍需试玩。
const normals=[[0,0,1],[0,0,-1],[0,1,0],[0,-1,0],[1,0,0],[-1,0,0],[1,1,0],[-1,1,0],[0,1,1],[0,1,-1]];
function targetPlanes(model,detailed=false){
    const directions=detailed?[]:normals;
    if(detailed)for(let x=-1;x<=1;x++)for(let y=-1;y<=1;y++)for(let z=-1;z<=1;z++){
        if(x||y||z)directions.push([x,y,z].map(v=>v/Math.hypot(x,y,z)));
    }
    const bounds=model.fiberRig.fibers.map(f=>directions.map(n=>Math.max(...f.ids.map(id=>n.reduce((s,v,a)=>s+v*model.topology.roots[id*3+a],0)))+.035));
    const mesh=model.cutMesh||model.fiberMesh,p=mesh.evaluate(model,false,true);
    for(let i=0;i<mesh.indices.length;i++){
        const group=mesh.groups[Math.floor(i/3)],k=mesh.indices[i]*3;
        for(let j=0;j<directions.length;j++)bounds[group][j]=Math.max(bounds[group][j],directions[j].reduce((s,v,a)=>s+v*p[k+a],0));
    }
    bounds.directions=directions;bounds.detailed=detailed;return bounds;
}
function trimToTarget(sim,order,bounds){
    if(!bounds.detailed)applyOrderTarget(sim,order);
    // 跨预设仅使用共用订单切面；同预设还检验前后和斜向修剪。
    if(sim.style!==order.style)return;
    const cutter=new PlaneHairCutter();
    for(const f of sim.fiberRig.fibers){
        const groups=new Set([f.group]);
        for(let j=0;j<bounds.directions.length;j++){
            const [x,y,z]=bounds.directions[j];cutter.clip(sim,{x,y,z,d:-bounds[f.group][j]},undefined,groups);
        }
    }
}
module.exports={targetPlanes,trimToTarget};
