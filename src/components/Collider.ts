import type { Component } from '../ecs/types'

export type ColliderShape = 'circle' | 'aabb'

/** 碰撞体组件 */
export interface ColliderComponent extends Component {
  readonly type: 'Collider'
  shape: ColliderShape
  /** 圆形：半径；AABB：半宽（x方向） */
  rx: number
  /** AABB：半高（y方向）；圆形忽略此值 */
  ry: number
  /** 重量（石）：决定碰撞结算模式 */
  weight: number
  /** 是否为触发器（不产生推力，只触发事件） */
  isTrigger: boolean
  /** 碰撞层掩码（按位与：非0才发生碰撞） */
  layer: number
  /** 碰撞掩码（与对方 layer 按位与） */
  mask: number
}

export function createCircleCollider(
  radius: number,
  weight: number,
  opts?: { isTrigger?: boolean; layer?: number; mask?: number },
): ColliderComponent {
  return {
    type: 'Collider',
    shape: 'circle',
    rx: radius,
    ry: radius,
    weight,
    isTrigger: opts?.isTrigger ?? false,
    layer: opts?.layer ?? 0b0001,
    mask:  opts?.mask  ?? 0b1111,
  }
}

export function createAABBCollider(
  halfW: number,
  halfH: number,
  weight: number,
  opts?: { isTrigger?: boolean; layer?: number; mask?: number },
): ColliderComponent {
  return {
    type: 'Collider',
    shape: 'aabb',
    rx: halfW,
    ry: halfH,
    weight,
    isTrigger: opts?.isTrigger ?? false,
    layer: opts?.layer ?? 0b0001,
    mask:  opts?.mask  ?? 0b1111,
  }
}

// ── 碰撞层常量 ────────────────────────────────
export const LAYER_PLAYER    = 0b0001
export const LAYER_ENEMY     = 0b0010
export const LAYER_ARTIFACT  = 0b0100
export const LAYER_PROJECTILE = 0b1000
