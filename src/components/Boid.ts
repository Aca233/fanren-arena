import type { Component } from '../ecs/types'

/** Boid 组件 —— 鸟群算法个体参数 */
export interface BoidComponent extends Component {
  readonly type: 'Boid'
  /** 所属群组 ID（同组才计算群行为） */
  groupId: string
  /** 分离权重 */
  separationWeight: number
  /** 对齐权重 */
  alignmentWeight: number
  /** 凝聚权重 */
  cohesionWeight: number
  /** 感知半径 */
  perceptionRadius: number
  /** 分离半径（太近则推开） */
  separationRadius: number
  /** 最大速度 */
  maxSpeed: number
  /** 最大转向力 */
  maxForce: number
  /** 追踪目标实体（-1 = 无目标，跟随群心） */
  targetId: number
  /** 追踪权重 */
  seekWeight: number
}

export function createBoid(
  groupId: string,
  opts?: Partial<Omit<BoidComponent, 'type' | 'groupId'>>,
): BoidComponent {
  return {
    type: 'Boid',
    groupId,
    separationWeight: opts?.separationWeight ?? 2.5,
    alignmentWeight: opts?.alignmentWeight ?? 1.0,
    cohesionWeight: opts?.cohesionWeight ?? 1.2,
    perceptionRadius: opts?.perceptionRadius ?? 80,
    separationRadius: opts?.separationRadius ?? 25,
    maxSpeed: opts?.maxSpeed ?? 280,
    maxForce: opts?.maxForce ?? 400,
    targetId: opts?.targetId ?? -1,
    seekWeight: opts?.seekWeight ?? 3.0,
  }
}
