import type { Component } from '../ecs/types'

/** 光环/领域组件 —— 挂载在法宝实体上，在场上生成隐形区域 */
export interface AuraComponent extends Component {
  readonly type: 'Aura'
  radius: number
  effect: string  // gravity / repulsion / slow / blind / confiscate / damage
  strength: number
  affectsTags: string[] | null  // null = 影响全部
}

/** 脚本钩子条目 */
export interface ScriptHookEntry {
  event: string  // onSpawn / onUpdate / onHit / onDestroy
  code: string
  compiled: ((ctx: ScriptContext) => void) | null
}

/** 脚本集合组件 */
export interface ScriptSetComponent extends Component {
  readonly type: 'ScriptSet'
  hooks: ScriptHookEntry[]
}

/** 脚本执行上下文 */
export interface ScriptContext {
  entity: number
  world: { globals: Record<string, unknown>; destroyEntity: (e: number) => void }
  dt: number
  target: number | null
}
