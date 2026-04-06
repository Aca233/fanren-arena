import type { Component } from '../ecs/types'

export type AIState = 'idle' | 'patrol' | 'alert' | 'attack' | 'flee' | 'berserk'

/** AI 控制器组件 —— 灵兽/自动法宝用 */
export interface AIControllerComponent extends Component {
  readonly type: 'AIController'
  /** 当前状态 */
  state: AIState
  /** 状态持续时间 */
  stateTimer: number
  /** 感知半径（侦测敌人） */
  senseRadius: number
  /** 攻击半径 */
  attackRadius: number
  /** 攻击间隔 */
  attackCooldown: number
  attackCooldownRemaining: number
  /** 攻击伤害 */
  attackDamage: number
  /** 当前锁定目标 */
  targetId: number
  /** 巡逻中心点 */
  homeX: number
  homeY: number
  /** 巡逻半径 */
  patrolRadius: number
  /** 当前巡逻目标点 */
  patrolX: number
  patrolY: number
  /** 移动速度 */
  moveSpeed: number
  /** 逃跑生命阈值（HP% 低于此值逃跑） */
  fleeThreshold: number
  /** 特殊行为标签（如 'ghost_hunter' → 检测鬼道法宝狂暴） */
  specialBehavior: string | null
}

export function createAIController(
  homeX: number, homeY: number,
  opts?: Partial<Omit<AIControllerComponent, 'type' | 'homeX' | 'homeY'>>,
): AIControllerComponent {
  return {
    type: 'AIController',
    state: 'idle',
    stateTimer: 0,
    senseRadius: opts?.senseRadius ?? 180,
    attackRadius: opts?.attackRadius ?? 40,
    attackCooldown: opts?.attackCooldown ?? 0.8,
    attackCooldownRemaining: 0,
    attackDamage: opts?.attackDamage ?? 25,
    targetId: -1,
    homeX,
    homeY,
    patrolRadius: opts?.patrolRadius ?? 100,
    patrolX: homeX,
    patrolY: homeY,
    moveSpeed: opts?.moveSpeed ?? 160,
    fleeThreshold: opts?.fleeThreshold ?? 0.2,
    specialBehavior: opts?.specialBehavior ?? null,
  }
}
