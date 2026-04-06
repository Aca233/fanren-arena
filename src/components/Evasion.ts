import type { Component } from '../ecs/types'

export type EvasionState = 'ready' | 'windup' | 'dashing' | 'recovery'

/** 遁术组件 */
export interface EvasionComponent extends Component {
  readonly type: 'Evasion'
  /** 冲刺名称（如"罗烟步"） */
  name: string
  /** 冲刺速度（像素/秒） */
  dashSpeed: number
  /** 冲刺持续时间（秒） */
  dashDuration: number
  /** 前摇时间（秒）—— 此阶段挂载无敌帧 */
  windupDuration: number
  /** 冷却时间（秒） */
  cooldown: number
  /** 当前冷却剩余（秒） */
  cooldownRemaining: number
  /** 当前状态 */
  state: EvasionState
  /** 当前状态已持续时间 */
  stateTimer: number
  /** 冲刺方向（单位向量） */
  dirX: number
  dirY: number
}

export function createEvasion(opts?: {
  name?: string
  dashSpeed?: number
  dashDuration?: number
  windupDuration?: number
  cooldown?: number
}): EvasionComponent {
  return {
    type: 'Evasion',
    name: opts?.name ?? '罗烟步',
    dashSpeed: opts?.dashSpeed ?? 800,
    dashDuration: opts?.dashDuration ?? 0.18,
    windupDuration: opts?.windupDuration ?? 0.08,
    cooldown: opts?.cooldown ?? 1.2,
    cooldownRemaining: 0,
    state: 'ready',
    stateTimer: 0,
    dirX: 0,
    dirY: -1,
  }
}

/** 无敌帧组件 —— 挂载期间免疫碰撞与神识锁定 */
export interface InvincibleComponent extends Component {
  readonly type: 'Invincible'
  /** 剩余无敌时间（秒）*/
  remaining: number
  /** 触发来源 */
  source: 'evasion' | 'item' | 'skill'
}

export function createInvincible(
  duration: number,
  source: InvincibleComponent['source'] = 'evasion',
): InvincibleComponent {
  return { type: 'Invincible', remaining: duration, source }
}
