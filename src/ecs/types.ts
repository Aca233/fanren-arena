// ──────────────────────────────────────────────
// ECS 核心类型定义
// ──────────────────────────────────────────────

/** 实体：纯数字 ID，无任何逻辑 */
export type Entity = number

export const NULL_ENTITY: Entity = -1

/** 组件：纯数据接口，必须携带 type 字段作为唯一标识 */
export interface Component {
  readonly type: string
}

/** 系统：纯逻辑，每帧接收 World 与 deltaTime */
export interface System {
  readonly name: string
  /** 世界启动时调用一次 */
  onStart?(world: import('./World').World): void
  /** 每帧调用 */
  update(world: import('./World').World, dt: number): void
  /** 世界停止时调用一次 */
  onStop?(world: import('./World').World): void
}

/** 组件类型标识符类型 */
export type ComponentType = { readonly type: string } | string
