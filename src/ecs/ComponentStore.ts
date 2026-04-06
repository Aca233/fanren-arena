import type { Entity, Component } from './types'

/**
 * 组件存储器 —— 按组件类型分桶存储，支持 O(1) 查询与批量遍历
 *
 * 存储结构：Map<componentType, Map<entityId, Component>>
 */
export class ComponentStore {
  private readonly buckets = new Map<string, Map<Entity, Component>>()

  /** 挂载组件到实体（同类型会覆盖旧值） */
  set<T extends Component>(entity: Entity, component: T): void {
    let bucket = this.buckets.get(component.type)
    if (!bucket) {
      bucket = new Map()
      this.buckets.set(component.type, bucket)
    }
    bucket.set(entity, component)
  }

  /** 读取指定类型的组件，不存在返回 undefined */
  get<T extends Component>(entity: Entity, type: string): T | undefined {
    return this.buckets.get(type)?.get(entity) as T | undefined
  }

  /** 判断实体是否持有指定组件 */
  has(entity: Entity, type: string): boolean {
    return this.buckets.get(type)?.has(entity) ?? false
  }

  /** 判断实体是否同时持有多个组件（用于 System 筛选） */
  hasAll(entity: Entity, types: readonly string[]): boolean {
    for (const t of types) {
      if (!this.has(entity, t)) return false
    }
    return true
  }

  /** 移除实体的某个组件 */
  remove(entity: Entity, type: string): void {
    this.buckets.get(type)?.delete(entity)
  }

  /** 移除实体的所有组件（销毁时调用） */
  removeAll(entity: Entity): void {
    for (const bucket of this.buckets.values()) {
      bucket.delete(entity)
    }
  }

  /**
   * 获取所有持有某类型组件的实体映射
   * 返回引用（非拷贝），遍历时不要修改 World
   */
  getAll<T extends Component>(type: string): ReadonlyMap<Entity, T> {
    return (this.buckets.get(type) ?? new Map()) as Map<Entity, T>
  }

  /** 查询同时持有多个组件的实体列表（System 查询的主要入口） */
  query(types: readonly string[]): Entity[] {
    if (types.length === 0) return []
    // 以数量最少的桶为基准，减少遍历量
    let base = types[0]
    let minSize = this.buckets.get(base)?.size ?? 0
    for (let i = 1; i < types.length; i++) {
      const s = this.buckets.get(types[i])?.size ?? 0
      if (s < minSize) { minSize = s; base = types[i] }
    }
    const baseBucket = this.buckets.get(base)
    if (!baseBucket) return []

    const result: Entity[] = []
    for (const entity of baseBucket.keys()) {
      if (this.hasAll(entity, types)) result.push(entity)
    }
    return result
  }

  /** 清空所有数据 */
  clear(): void {
    this.buckets.clear()
  }
}
