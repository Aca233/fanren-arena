import type { Component } from '../ecs/types'

export type ProjectileShape = 'fire_ball' | 'ice_cone' | 'lightning' | 'generic'

/** 弹幕/符箓组件 */
export interface ProjectileComponent extends Component {
  readonly type: 'Projectile'
  /** 发射者实体 ID */
  ownerId: number
  /** 飞行速度（像素/秒） */
  speed: number
  /** 剩余存活时间（秒），0 = 永久直到碰撞 */
  lifetime: number
  /** 已存活时间 */
  age: number
  /** 碰撞伤害 */
  damage: number
  /** 穿透次数（0 = 碰到第一个目标即消亡） */
  piercing: number
  /** 已命中目标数 */
  hitCount: number
  /** 外观类型 */
  shape: ProjectileShape
  /** 颜色 */
  color: string
}

export function createProjectile(
  ownerId: number,
  opts?: {
    speed?: number
    lifetime?: number
    damage?: number
    piercing?: number
    shape?: ProjectileShape
    color?: string
  },
): ProjectileComponent {
  return {
    type: 'Projectile',
    ownerId,
    speed: opts?.speed ?? 600,
    lifetime: opts?.lifetime ?? 2.5,
    age: 0,
    damage: opts?.damage ?? 20,
    piercing: opts?.piercing ?? 0,
    hitCount: 0,
    shape: opts?.shape ?? 'generic',
    color: opts?.color ?? '#ffdd44',
  }
}
