import type { Entity, Component, System } from './types'
import { NULL_ENTITY } from './types'
import { EntityPool } from './EntityPool'
import { ComponentStore } from './ComponentStore'

/**
 * World —— ECS 核心世界，管理实体生命周期、组件存储与系统调度
 *
 * 设计原则：
 *   - 实体是纯 ID，组件是纯数据，系统是纯逻辑
 *   - 销毁操作延迟到帧末 flush，避免迭代中删改
 *   - 链式 API（addComponent/removeComponent 返回 this）
 */
export class World {
  private readonly pool: EntityPool
  private readonly store: ComponentStore
  private readonly systems: System[] = []
  private readonly pendingDestroy = new Set<Entity>()
  private started = false

  /** 全局自定义数据（可存放 timeScale 等跨系统共享状态） */
  readonly globals: Record<string, unknown> = {
    timeScale: 1.0,
  }

  constructor(poolCapacity = 1000) {
    this.pool = new EntityPool(poolCapacity)
    this.store = new ComponentStore()
  }

  // ──────────────────────────────────────────────
  // 实体管理
  // ──────────────────────────────────────────────

  createEntity(): Entity {
    return this.pool.acquire()
  }

  /** 标记实体为待销毁（帧末统一清理） */
  destroyEntity(entity: Entity): void {
    if (entity !== NULL_ENTITY && this.pool.isAlive(entity)) {
      this.pendingDestroy.add(entity)
    }
  }

  isAlive(entity: Entity): boolean {
    return this.pool.isAlive(entity)
  }

  get entityCount(): number {
    return this.pool.size
  }

  // ──────────────────────────────────────────────
  // 组件管理
  // ──────────────────────────────────────────────

  addComponent<T extends Component>(entity: Entity, component: T): this {
    this.store.set(entity, component)
    return this
  }

  getComponent<T extends Component>(entity: Entity, type: string): T | undefined {
    return this.store.get<T>(entity, type)
  }

  hasComponent(entity: Entity, type: string): boolean {
    return this.store.has(entity, type)
  }

  removeComponent(entity: Entity, type: string): this {
    this.store.remove(entity, type)
    return this
  }

  /** 查询同时持有多个组件的实体列表 */
  query(types: readonly string[]): Entity[] {
    return this.store.query(types)
  }

  /** 获取某类组件的全部实体映射（只读） */
  getAllWithComponent<T extends Component>(type: string): ReadonlyMap<Entity, T> {
    return this.store.getAll<T>(type)
  }

  // ──────────────────────────────────────────────
  // 系统管理
  // ──────────────────────────────────────────────

  addSystem(system: System): this {
    this.systems.push(system)
    if (this.started) system.onStart?.(this)
    return this
  }

  removeSystem(name: string): void {
    const idx = this.systems.findIndex(s => s.name === name)
    if (idx !== -1) {
      this.systems[idx].onStop?.(this)
      this.systems.splice(idx, 1)
    }
  }

  // ──────────────────────────────────────────────
  // 主循环接口
  // ──────────────────────────────────────────────

  /** 世界启动：触发所有系统的 onStart */
  start(): void {
    if (this.started) return
    this.started = true
    for (const s of this.systems) s.onStart?.(this)
  }

  /** 每帧调用：按顺序执行所有系统，然后清理销毁队列 */
  update(dt: number): void {
    const scaledDt = dt * (this.globals.timeScale as number)
    for (const s of this.systems) {
      s.update(this, scaledDt)
    }
    this._flushDestroyQueue()
  }

  /** 世界停止：触发所有系统的 onStop */
  stop(): void {
    if (!this.started) return
    for (const s of this.systems) s.onStop?.(this)
    this.started = false
  }

  /** 完全重置（清空实体与组件，保留系统注册） */
  reset(): void {
    this.stop()
    this.store.clear()
    this.pool.reset()
    this.pendingDestroy.clear()
    this.globals.timeScale = 1.0
  }

  // ──────────────────────────────────────────────
  // 内部
  // ──────────────────────────────────────────────

  private _flushDestroyQueue(): void {
    if (this.pendingDestroy.size === 0) return
    for (const entity of this.pendingDestroy) {
      this.store.removeAll(entity)
      this.pool.release(entity)
    }
    this.pendingDestroy.clear()
  }
}
