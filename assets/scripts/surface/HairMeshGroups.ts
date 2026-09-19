import { Binding, BoundHairMesh } from './BoundHairMesh';
/** 仅复制所需发缕；原绑定对象保持身份，使未剪区域能够直接复用。 */
export function selectHairGroups(source: BoundHairMesh, selected: ReadonlySet<number>, replacement?: BoundHairMesh): BoundHairMesh {
    const bindings: Binding[] = [], indices: number[] = [], caps: boolean[] = [], groups: number[] = [], lookup = new Map<Binding, number>();
    const append = (mesh: BoundHairMesh, filter: boolean): void => {
        for (let f = 0; f < mesh.indices.length; f += 3) {
            const group = mesh.groups[f / 3];
            if (filter && selected.has(group) === !!replacement)
                continue;
            for (let j = 0; j < 3; j++) {
                const binding = mesh.bindings[mesh.indices[f + j]];
                let id = lookup.get(binding);
                if (id === undefined) {
                    id = bindings.length;
                    bindings.push(binding);
                    lookup.set(binding, id);
                }
                indices.push(id);
            }
            caps.push(mesh.caps[f / 3]);
            groups.push(group);
        }
    };
    append(source, true);
    if (replacement)
        append(replacement, false);
    return new BoundHairMesh(bindings, indices, caps, groups);
}
