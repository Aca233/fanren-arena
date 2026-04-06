import type { Component } from '../ecs/types'

/** 行为条目（运行时数据） */
export interface BehaviorEntry {
  trigger: string   // onHit / onDistance / onSpawn / onDestroy / onInterval
  triggerValue: number
  action: string    // Spawn / ApplyBuff / Explode / Absorb / Teleport
  actionParams: Record<string, unknown>
  cooldown: number
  cooldownMax: number
}

/** 行为集合组件 —— 挂载在法宝实体上 */
export interface BehaviorSetComponent extends Component {
  readonly type: 'BehaviorSet'
  behaviors: BehaviorEntry[]
}

/** Buff/Debuff 组件 */
export interface BuffComponent extends Component {
  readonly type: 'Buff'
  effects: BuffEffect[]
}

export interface BuffEffect {
  name: string
  /** 剩余持续时间（秒） */
  remaining: number
  /** 每秒伤害（负数为每秒回复） */
  dotPerSec: number
  /** 移速倍率修正（0.5 = 减速50%） */
  speedMul: number
}

export function createBuff(effects: BuffEffect[]): BuffComponent {
  return { type: 'Buff', effects }
}
