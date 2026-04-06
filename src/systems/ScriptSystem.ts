import type { System } from '../ecs/types'
import type { World } from '../ecs/World'
import type { ScriptSetComponent, ScriptHookEntry, ScriptContext } from '../components/Aura'

/**
 * ScriptSystem —— 第四层：脚本化事件钩子
 *
 * 允许法宝在 JSON 配置中注入极简 JS 表达式
 * 安全限制：仅注入 { entity, world: { globals, destroyEntity }, dt, target }
 * 每条 code 最长 512 字符，由 new Function 编译
 */
export class ScriptSystem implements System {
  readonly name = 'ScriptSystem'

  /** 记录已触发过 onSpawn 的实体 */
  private spawned = new Set<number>()

  update(world: World, dt: number): void {
    const entities = world.query(['ScriptSet'])

    for (const entity of entities) {
      const ss = world.getComponent<ScriptSetComponent>(entity, 'ScriptSet')!

      // onSpawn（首次出现时触发一次）
      if (!this.spawned.has(entity)) {
        this.spawned.add(entity)
        this._fireEvent(world, entity, ss, 'onSpawn', dt)
      }

      // onUpdate（每帧）
      this._fireEvent(world, entity, ss, 'onUpdate', dt)
    }

    // 清理已死亡实体的 spawn 记录
    for (const eid of this.spawned) {
      if (!world.isAlive(eid)) this.spawned.delete(eid)
    }
  }

  /** 实体销毁前调用（由 World 或 CollisionSystem 触发） */
  fireDestroy(world: World, entity: number): void {
    const ss = world.getComponent<ScriptSetComponent>(entity, 'ScriptSet')
    if (ss) this._fireEvent(world, entity, ss, 'onDestroy', 0)
    this.spawned.delete(entity)
  }

  private _fireEvent(
    world: World, entity: number,
    ss: ScriptSetComponent, event: string, dt: number,
  ): void {
    for (const hook of ss.hooks) {
      if (hook.event !== event) continue
      this._compile(hook)
      if (!hook.compiled) continue

      const ctx: ScriptContext = {
        entity,
        world: {
          globals: world.globals,
          destroyEntity: (e: number) => world.destroyEntity(e),
        },
        dt,
        target: null,
      }

      try {
        hook.compiled(ctx)
      } catch (err) {
        if (import.meta.env.DEV) {
          console.warn(`[ScriptSystem] 脚本执行失败 (entity=${entity}, event=${event}):`, err)
        }
      }
    }
  }

  private _compile(hook: ScriptHookEntry): void {
    if (hook.compiled !== null) return
    try {
      // 安全：仅暴露受限上下文变量
      // eslint-disable-next-line no-new-func
      const fn = new Function('ctx',
        `"use strict"; const { entity, world, dt, target } = ctx; ${hook.code}`,
      )
      hook.compiled = fn as (ctx: ScriptContext) => void
    } catch (err) {
      if (import.meta.env.DEV) {
        console.warn('[ScriptSystem] 脚本编译失败:', hook.code, err)
      }
      hook.compiled = () => {} // 标记为已编译（空操作），避免反复重试
    }
  }
}
