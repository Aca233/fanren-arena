/**
 * 物理碰撞算法库 —— 纯函数，无副作用
 */

export interface Vec2 { x: number; y: number }

export interface CircleShape { cx: number; cy: number; r: number }
export interface AABBShape   { minX: number; minY: number; maxX: number; maxY: number }

/** 碰撞结果：穿透深度与推开方向 */
export interface CollisionResult {
  /** 是否碰撞 */
  hit: boolean
  /** 穿透深度（>0 时需要推开） */
  depth: number
  /** 推开方向（从 B 指向 A 的单位向量） */
  nx: number
  ny: number
}

const NO_HIT: CollisionResult = { hit: false, depth: 0, nx: 0, ny: 0 }

// ── 圆 vs 圆 ──────────────────────────────────

export function circleVsCircle(
  ax: number, ay: number, ar: number,
  bx: number, by: number, br: number,
): CollisionResult {
  const dx = ax - bx
  const dy = ay - by
  const distSq = dx * dx + dy * dy
  const sumR = ar + br
  if (distSq >= sumR * sumR) return NO_HIT

  const dist = Math.sqrt(distSq)
  const depth = sumR - dist
  if (dist < 1e-6) {
    // 完全重叠，随机推开方向
    return { hit: true, depth, nx: 1, ny: 0 }
  }
  return { hit: true, depth, nx: dx / dist, ny: dy / dist }
}

// ── AABB vs AABB ──────────────────────────────

export function aabbVsAabb(a: AABBShape, b: AABBShape): CollisionResult {
  const overlapX = Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX)
  const overlapY = Math.min(a.maxY, b.maxY) - Math.max(a.minY, b.minY)
  if (overlapX <= 0 || overlapY <= 0) return NO_HIT

  if (overlapX < overlapY) {
    const cx = (a.minX + a.maxX) / 2
    const bcx = (b.minX + b.maxX) / 2
    const nx = cx > bcx ? 1 : -1
    return { hit: true, depth: overlapX, nx, ny: 0 }
  } else {
    const cy = (a.minY + a.maxY) / 2
    const bcy = (b.minY + b.maxY) / 2
    const ny = cy > bcy ? 1 : -1
    return { hit: true, depth: overlapY, nx: 0, ny }
  }
}

// ── 圆 vs AABB ────────────────────────────────

export function circleVsAabb(
  cx: number, cy: number, cr: number,
  aabb: AABBShape,
): CollisionResult {
  // 找到 AABB 上距圆心最近的点
  const nearX = Math.max(aabb.minX, Math.min(cx, aabb.maxX))
  const nearY = Math.max(aabb.minY, Math.min(cy, aabb.maxY))
  const dx = cx - nearX
  const dy = cy - nearY
  const distSq = dx * dx + dy * dy
  if (distSq >= cr * cr) return NO_HIT

  const dist = Math.sqrt(distSq)
  const depth = cr - dist
  if (dist < 1e-6) {
    return { hit: true, depth, nx: 0, ny: -1 }
  }
  return { hit: true, depth, nx: dx / dist, ny: dy / dist }
}

// ── 工具函数 ──────────────────────────────────

/** 根据实体位置与碰撞体半径构造 AABB */
export function makeAABB(x: number, y: number, rx: number, ry: number): AABBShape {
  return { minX: x - rx, minY: y - ry, maxX: x + rx, maxY: y + ry }
}

/** 计算两点距离 */
export function dist(ax: number, ay: number, bx: number, by: number): number {
  const dx = ax - bx
  const dy = ay - by
  return Math.sqrt(dx * dx + dy * dy)
}

/** 计算两点距离平方（避免 sqrt，用于比较） */
export function distSq(ax: number, ay: number, bx: number, by: number): number {
  const dx = ax - bx
  const dy = ay - by
  return dx * dx + dy * dy
}

/** 规范化向量，零向量返回 (0,0) */
export function normalize(x: number, y: number): Vec2 {
  const len = Math.sqrt(x * x + y * y)
  if (len < 1e-9) return { x: 0, y: 0 }
  return { x: x / len, y: y / len }
}

/** 线性插值 */
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

// ── 射线/线段 vs 圆 ──────────────────────────

/** 线段与圆的相交检测（剑丝切割用） */
export function lineSegmentVsCircle(
  x1: number, y1: number, x2: number, y2: number,
  cx: number, cy: number, cr: number,
): boolean {
  const dx = x2 - x1
  const dy = y2 - y1
  const fx = x1 - cx
  const fy = y1 - cy
  const a = dx * dx + dy * dy
  const b = 2 * (fx * dx + fy * dy)
  const c = fx * fx + fy * fy - cr * cr
  let discriminant = b * b - 4 * a * c
  if (discriminant < 0) return false
  discriminant = Math.sqrt(discriminant)
  const t1 = (-b - discriminant) / (2 * a)
  const t2 = (-b + discriminant) / (2 * a)
  return (t1 >= 0 && t1 <= 1) || (t2 >= 0 && t2 <= 1) || (t1 < 0 && t2 > 1)
}

/** 将角度钳位到 canvas 边界 */
export function clampToBounds(
  x: number, y: number, r: number, w: number, h: number,
): { x: number; y: number } {
  return {
    x: Math.max(r, Math.min(w - r, x)),
    y: Math.max(r, Math.min(h - r, y)),
  }
}
