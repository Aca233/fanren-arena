import type { Component } from '../ecs/types'

/** 空间变换组件 —— 位置、速度、朝向 */
export interface TransformComponent extends Component {
  readonly type: 'Transform'
  x: number
  y: number
  vx: number
  vy: number
  /** 朝向角度（弧度），0 = 向右 */
  rotation: number
}

export function createTransform(x = 0, y = 0): TransformComponent {
  return { type: 'Transform', x, y, vx: 0, vy: 0, rotation: 0 }
}
