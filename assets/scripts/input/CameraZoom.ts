/** 双指接管后，必须全部松手才能重新开始单指操作。 */
export class CameraZoom {
    factor = 1;
    readonly min = .55;
    readonly max = 1.65;
    private readonly points = new Map<number, { x: number; y: number }>();
    private blocked = false;
    private separation = 0;
    set(value: number): void {
        if (Number.isFinite(value)) this.factor = Math.max(this.min, Math.min(this.max, value));
    }
    scale(ratio: number): void { if (ratio > 0) this.set(this.factor * ratio); }
    wheel(pixels: number): void { this.scale(Math.exp(Math.max(-500, Math.min(500, pixels)) * .001)); }
    down(id: number, x: number, y: number): boolean {
        this.points.set(id, { x, y });
        if (this.points.size >= 2) this.blocked = true;
        this.separation = this.distance();
        return this.blocked;
    }
    move(id: number, x: number, y: number): boolean {
        const point = this.points.get(id);
        if (!point) return false;
        point.x = x; point.y = y;
        const next = this.distance();
        if (next > 4 && this.separation > 4) this.scale(this.separation / next);
        this.separation = next;
        return this.blocked;
    }
    up(id: number): boolean {
        const consumed = this.blocked;
        this.points.delete(id);
        this.separation = this.distance();
        if (!this.points.size) this.blocked = false;
        return consumed;
    }
    cancel(): void { this.points.clear(); this.blocked = false; this.separation = 0; }
    private distance(): number {
        if (this.points.size < 2) return 0;
        const values = this.points.values(), a = values.next().value!, b = values.next().value!;
        return Math.hypot(a.x - b.x, a.y - b.y);
    }
}
