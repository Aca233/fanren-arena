import type { Component } from '../ecs/types'

/** 标签组件 —— 用于克制系统与碰撞前拦截 */
export interface TagComponent extends Component {
  readonly type: 'Tag'
  tags: Set<string>
  /** 实体角色：player / enemy / artifact / projectile / dummy */
  role: 'player' | 'enemy' | 'artifact' | 'projectile' | 'dummy'
}

export function createTag(role: TagComponent['role'], tags: string[] = []): TagComponent {
  return { type: 'Tag', role, tags: new Set(tags) }
}
