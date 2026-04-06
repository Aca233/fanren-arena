import type { Entity } from './types'

/**
 * 高性能对象池 —— 预分配 N 个实体槽，借出/归还时零垃圾回收
 *
 * 实现原理：
 *   - 初始化时将 [0, capacity) 全部压入空闲栈
 *   - acquire()  → 从栈顶弹出一个 ID，O(1)
 *   - release()  → 将 ID 压回栈顶，O(1)
 *   - 若池耗尽，自动扩容（超出预分配范围）
 */
export class EntityPool {
  private readonly freeStack: Int32Array
  private freeTop: number
  private overflowNext: number
  private readonly aliveSet: Set<Entity>

  readonly capacity: number

  constructor(capacity = 1000) {
    this.capacity = capacity
    this.freeStack = new Int32Array(capacity)
    // 预填充：倒序压栈，使 acquire() 第一次返回 0（栈顶 = capacity-1 处存 0）
    for (let i = 0; i < capacity; i++) {
      this.freeStack[i] = capacity - 1 - i
    }
    this.freeTop = capacity - 1
    this.overflowNext = capacity
    this.aliveSet = new Set()
  }

  /**
   * 借出一个实体 ID
   * 若池内有空闲槽 → O(1) 弹出
   * 若池已满 → 自动分配新 ID（超出预分配范围，会触发 GC，但属于异常情况）
   */
  acquire(): Entity {
    let id: Entity
    if (this.freeTop >= 0) {
      id = this.freeStack[this.freeTop--]
    } else {
      // 池耗尽，发出警告并扩容
      if (import.meta.env.DEV) {
        console.warn(`[EntityPool] 池容量 ${this.capacity} 已耗尽，自动扩容（id=${this.overflowNext}）`)
      }
      id = this.overflowNext++
    }
    this.aliveSet.add(id)
    return id
  }

  /**
   * 归还一个实体 ID
   * 重复归还同一 ID 会被安全忽略
   */
  release(entity: Entity): void {
    if (!this.aliveSet.has(entity)) return
    this.aliveSet.delete(entity)
    if (entity < this.capacity) {
      this.freeStack[++this.freeTop] = entity
    }
    // overflow ID 直接丢弃，不回收（超出预分配范围的实体很少）
  }

  /** 查询实体是否存活 */
  isAlive(entity: Entity): boolean {
    return this.aliveSet.has(entity)
  }

  /** 当前存活实体数量 */
  get size(): number {
    return this.aliveSet.size
  }

  /** 获取所有存活实体的快照（用于调试） */
  snapshot(): Entity[] {
    return Array.from(this.aliveSet)
  }

  /** 归还所有实体，重置池到初始状态 */
  reset(): void {
    this.aliveSet.clear()
    for (let i = 0; i < this.capacity; i++) {
      this.freeStack[i] = this.capacity - 1 - i
    }
    this.freeTop = this.capacity - 1
    this.overflowNext = this.capacity
  }
}
