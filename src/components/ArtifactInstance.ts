import type { Component } from '../ecs/types'

/**
 * 法宝实例组件 —— 挂载在已祭出法宝实体上
 *
 * 记录法宝与主人的绑定关系、当前状态、环绕参数
 */
export type ArtifactState =
  | 'orbiting'   // 环绕主人悬浮
  | 'chasing'    // 追踪目标缠斗
  | 'bezier'     // 沿贝塞尔曲线飞行
  | 'stunned'    // 失控僵直
  | 'returning'  // 被召回/收回中

export interface ArtifactInstanceComponent extends Component {
  readonly type: 'ArtifactInstance'
  /** 主人实体 ID */
  ownerId: number
  /** 法宝预设 ID（对应 ArtifactSchema 中的 id） */
  presetId: string
  /** 当前状态 */
  state: ArtifactState
  /** 状态计时器 */
  stateTimer: number
  /** 环绕角度偏移（弧度） */
  orbitAngle: number
  /** 环绕半径 */
  orbitRadius: number
  /** 环绕速度（弧度/秒） */
  orbitSpeed: number
  /** 追踪目标实体 ID（chasing 模式） */
  targetId: number
  /** 占用神识值 */
  divineCost: number
  /** 贝塞尔曲线控制点（bezier 模式） */
  bezierPoints: { x: number; y: number }[]
  /** 贝塞尔曲线进度 [0,1] */
  bezierT: number
  /** 贝塞尔飞行速度 */
  bezierSpeed: number
  /** 失控/僵直剩余时间 */
  stunRemaining: number
}

let _orbitIndex = 0

export function createArtifactInstance(
  ownerId: number,
  presetId: string,
  opts?: {
    divineCost?: number
    orbitRadius?: number
    orbitSpeed?: number
  },
): ArtifactInstanceComponent {
  const angle = (_orbitIndex++ / 5) * Math.PI * 2
  return {
    type: 'ArtifactInstance',
    ownerId,
    presetId,
    state: 'orbiting',
    stateTimer: 0,
    orbitAngle: angle,
    orbitRadius: opts?.orbitRadius ?? 65,
    orbitSpeed: opts?.orbitSpeed ?? 2.0,
    targetId: -1,
    divineCost: opts?.divineCost ?? 15,
    bezierPoints: [],
    bezierT: 0,
    bezierSpeed: 1.5,
    stunRemaining: 0,
  }
}
