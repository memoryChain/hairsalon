import type { HairStyle } from '../core/HairstyleCatalog';
/** 根区生长开关；裸露区域不生成发体，完整头皮仍用于绑定与检查。 */
export function growsHair(style: HairStyle, x: number, y: number, z: number): boolean {
    if (style === 'bald') return false;
    if ((style === 'crown' || style === 'crownlong')) return !((x/.31)**2+((z+.11)/.35)**2<1 && y>.38);
    if (style === 'horseshoe' || style === 'combover' || style === 'doublecover' || style === 'backcover') return !(y>.30 && (z>-.25 || y>.60));
    return true;
}
