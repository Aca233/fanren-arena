import type { Component } from '../ecs/types'

/** 移动参数组件 */
export interface MovementComponent extends Component {
  readonly type: 'Movement'
  /** 基础移速（像素/秒） */
  baseSpeed: number
  /** 当前实际移速（含加成） */
  speed: number
  /** 提气加速倍率（Shift 键） */
  boostMultiplier: number
  /** 卸力衰减系数（0~1，越小越滑） */
  friction: number
  /** 是否正在提气 */
  isBoosting: boolean
}

export function createMovement(
  baseSpeed: number,
  opts?: { boostMultiplier?: number; friction?: number },
): MovementComponent {
  return {
    type: 'Movement',
    baseSpeed,
    speed: baseSpeed,
    boostMultiplier: opts?.boostMultiplier ?? 1.8,
    friction: opts?.friction ?? 0.82,
    isBoosting: false,
  }
}
