import { HairStyle } from '../core/HairstyleCatalog';
import { SurfaceHairSimulation } from '../surface/SurfaceHairSimulation';
import { SalonOrder } from './SalonOrders';

export interface InitialLook { id:string; style:HairStyle; growth:number; }
export function getInitialLooks(order:SalonOrder):InitialLook[] {
    const choices=STARTS[order.id];
    if(!choices)throw new Error('订单缺少兼容初始造型');
    return choices.map(([style,growth])=>({id:style+'/'+growth,style,growth}));
}
/** 初始造型本身与目标拉开差异；只在进店/重试生成，结算无额外扣分。 */
export function applyInitialLook(sim:SurfaceHairSimulation,look:InitialLook):void {
    sim.reset(look.style,look.growth);
    sim.clearVelocity();
}

// 配对需同时通过原评分 <=59、轮廓 <=65、真实修剪后 >=85 的回归。
// 不再使用已修好一半的目标造型充当新起点。
const STARTS: Record<string, readonly [HairStyle,number][]> = {
    'bruce-lee': [["bob",1.8],["bob",2.2],["long",1]],
    'jackie-chan': [["curtains",1.45],["curtains",1.8],["waves",1]],
    'marilyn-monroe': [["waves",1.45],["waves",1.8]],
    'stephen-chow': [["long",1.45],["long",1.8],["lob",1],["curtains",1]],
    'andy-lau': [["quiff",2.2],["quiff",2.6]],
    'chow-yun-fat': [["quiff",2.2],["quiff",2.6]],
    'jay-chou': [["curtains",1.45],["curtains",1.8],["long",1],["lob",1]],
    'aaron-kwok': [["quiff",2.2],["quiff",2.6]],
    'jacky-cheung': [["asymmetric",1.45],["asymmetric",1.8]],
    'nicholas-tse': [["spiky",1.45],["spiky",1.8]],
    'eason-chan': [["afro",1.45],["afro",2.2]],
    'tony-leung': [["lob",1.45],["lob",1.8],["long",1],["curtains",1]],
    'takeshi-kaneshiro': [["quiff",2.2],["quiff",2.6]],
    'elvis-presley': [["quiff",2.2],["quiff",2.6]],
    'michael-jackson': [["mane",1.45],["mane",1.8]],
    'david-beckham': [["spiky",1.45],["spiky",1.8]],
    'rowan-atkinson': [["lob",1.45],["lob",1.8],["long",1],["curtains",1]],
    'audrey-hepburn': [["long",1.45],["long",1.8],["lob",1],["curtains",1]],
    'charlie-chaplin': [["asymmetric",1.45],["asymmetric",1.8]],
    'will-smith': [["afro",2.2],["afro",2.6]],
    'animal-horse': [["spiky",2.2],["spiky",2.6]],
    'animal-donkey': [["spiky",1.8],["spiky",2.2]],
    'animal-lion': [["mane",1.45],["mane",1.8]],
    'animal-alpaca': [["afro",1.45],["afro",2.2]],
    'animal-sheep': [["afro",2.1],["afro",2.5]],
    'animal-hedgehog': [["spiky",2.2],["spiky",2.6]],
};
