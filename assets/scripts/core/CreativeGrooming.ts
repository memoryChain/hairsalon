import type { HairStyle, HairCurve } from './HairstyleCatalog';
export function creativeCurve(style:HairStyle,r:number[],n:number[],c:number[]):HairCurve|null {
    const x=r[0]-c[0],y=r[1]-c[1],z=r[2]-c[2],top=Math.max(0,n[1]),side=x<0?-1:1;
    const az=Math.atan2(x,z),wave=Math.sin(az*5+y*9),layer=top*top;
    if(style==='afro'){
        const d=Math.hypot(x/.57,y/.73,z/.54)||1,dx=x/.57/d,dy=y/.73/d,dz=z/.54/d;
        const size=1.17+.055*Math.sin(az*9+y*16);
        return {end:[c[0]+dx*size,c[1]+dy*(size+.16),c[2]+dz*size],control:[r[0]+n[0]*.75,r[1]+n[1]*.82,r[2]+n[2]*.75]};
    }
    if(style==='doublecover'||style==='backcover'){
        const donor=style==='doublecover'?Math.abs(x)>.30&&y>.20&&z>-.27:z<-.28&&y>.32;
        if(donor){
            if(style==='doublecover')return {end:[c[0]-side*.38,c[1]+.69+(side>0?.06:0),r[2]-.08],control:[c[0]+side*.35,c[1]+1.30+(side>0?.12:0),r[2]-.03]};
            return {end:[r[0]*.55+c[0]*.45,c[1]+.49,c[2]+.59],control:[r[0]*.75+c[0]*.25,c[1]+1.42,c[2]-.07]};
        }
        return {end:[r[0]+n[0]*.10,r[1]+n[1]*.10,r[2]+n[2]*.10],control:[r[0]+n[0]*.13,r[1]+n[1]*.13,r[2]+n[2]*.13]};
    }
    if(style!=='mane'&&style!=='waves'&&style!=='curtains'&&style!=='crownlong')return null;
    let a=az;
    if(z>0&&Math.abs(a)<1.02)a=side*1.02;
    const spread=style==='mane'?1.10:style==='waves'?1.02:.80;
    const bottom=style==='mane'?-.70+.78*layer:style==='waves'?-.95+.53*layer:-1.05+.63*layer;
    const twist=style==='waves'?.16*wave:style==='mane'?.09*wave:0;
    let end=[c[0]+Math.sin(a+twist)*(spread+.035*wave),c[1]+bottom+.055*wave,c[2]+Math.cos(a+twist)*(spread-.06)];
    const belly=style==='mane'?1.33:style==='waves'?.79:.97;
    let control=[c[0]+Math.sin(a)*belly,Math.min(r[1]+.12,c[1]+.33),c[2]+Math.cos(a)*(belly-.03)];
    if(style==='mane'&&z>.2&&Math.abs(az)<.8){
        end=[r[0]+side*.22,c[1]+.32+.12*Math.abs(x),c[2]+.80];control=[r[0]+side*.12,r[1]+.26,c[2]+.98];
    }
    const cap=Math.max(0,Math.min(1,(top-.92)/.075)),blend=cap*cap*(3-2*cap);
    for(let i=0;i<3;i++){end[i]=end[i]*(1-blend)+(r[i]+n[i]*.26)*blend;control[i]=control[i]*(1-blend)+(r[i]+n[i]*.32)*blend;}
    return {end,control};
}
