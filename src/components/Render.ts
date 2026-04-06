import type { Component } from '../ecs/types'

/** 渲染组件 —— Canvas 绘制参数 */
export interface RenderComponent extends Component {
  readonly type: 'Render'
  radius: number
  color: string
  /** 可选：发光色（CSS glow） */
  glowColor?: string
  /** 可选：显示标签 */
  label?: string
  /** 是否可见 */
  visible: boolean
}

export function createRender(radius: number, color: string, label?: string): RenderComponent {
  return { type: 'Render', radius, color, label, visible: true }
}
