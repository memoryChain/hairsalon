import { Ray } from '../hair/HairSimulation';
export interface Position {
    x: number;
    y: number;
    z: number;
}
/** 先绕竖轴转向，再绕屏幕横轴俯仰；所有路径共用头部中心枢轴。 */
export function pose(x: number, y: number, z: number, yaw: number, pitch: number, center: readonly number[], out: Position): void {
    const c = Math.cos(yaw), s = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
    x -= center[0];
    y -= center[1];
    z -= center[2];
    const a = c * x + s * z, b = -s * x + c * z;
    out.x = a + center[0];
    out.y = cp * y - sp * b + center[1];
    out.z = sp * y + cp * b + center[2];
}
export function unposeRay(r: Ray, yaw: number, pitch: number, center: readonly number[], out: Ray): void {
    const c = Math.cos(yaw), s = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
    const x = r.ox - center[0], y = r.oy - center[1], z = r.oz - center[2], b = -sp * y + cp * z;
    out.ox = c * x - s * b + center[0];
    out.oy = cp * y + sp * z + center[1];
    out.oz = s * x + c * b + center[2];
    const dz = -sp * r.dy + cp * r.dz;
    out.dx = c * r.dx - s * dz;
    out.dy = cp * r.dy + sp * r.dz;
    out.dz = s * r.dx + c * dz;
}
