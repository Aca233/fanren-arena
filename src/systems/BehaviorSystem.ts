import type { System } from '../ecs/types'
import type { World } from '../ecs/World'
import type { TransformComponent } from '../components/Transform'
import type { BehaviorSetComponent, BehaviorEntry } from '../components/Behavior'
import type { ArtifactInstanceComponent } from '../components/ArtifactInstance'
import type { TagComponent } from '../components/Tag'
import type { CollisionEvent } from './CollisionSystem'
import { createTransform } from '../components/Transform'
import { createRender } from '../components/Render'
import { createSpirituality } from '../components/Stats'
import { createCircleCollider, LAYER_ARTIFACT, LAYER_ENEMY } from '../components/Collider'
import { createTag } from '../components/Tag'
import { createBuff } from '../components/Behavior'
import type { BuffComponent } from '../components/Behavior'
import type { HealthComponent } from '../components/Stats'
import { distSq } from '../physics/collision'

/**
 * BehaviorSystem —— 第二层：触发器与行为
 *
 * 遍历所有持有 BehaviorSet 的实体，检查触发条件，执行行为
 */
export class BehaviorSystem implements System {
  readonly name = 'BehaviorSystem'

  update(world: World, dt: number): void {
    const entities = world.query(['Transform', 'BehaviorSet'])

    for (const entity of entities) {
      const tf = world.getComponent<TransformComponent>(entity, 'Transform')!
      const bs = world.getComponent<BehaviorSetComponent>(entity, 'BehaviorSet')!

      for (const beh of bs.behaviors) {
        // 冷却
        if (beh.cooldown > 0) { beh.cooldown -= dt; continue }

        if (this._checkTrigger(world, entity, tf, beh, dt)) {
          this._executeAction(world, entity, tf, beh)
          beh.cooldown = beh.cooldownMax
        }
      }
    }

    // ── Buff tick ──
    this._tickBuffs(world, dt)
  }

  private _checkTrigger(
    world: World, entity: number,
    tf: TransformComponent, beh: BehaviorEntry, dt: number,
  ): boolean {
    switch (beh.trigger) {
      case 'onHit': {
        const events = (world.globals.collisionEvents ?? []) as CollisionEvent[]
        return events.some(e => e.entityA === entity || e.entityB === entity)
      }
      case 'onDistance': {
        const threshold = beh.triggerValue || 80
        const enemies = world.query(['Transform', 'Tag'])
        for (const eid of enemies) {
          const tag = world.getComponent<TagComponent>(eid, 'Tag')
          if (!tag || (tag.role !== 'dummy' && tag.role !== 'enemy')) continue
          const etf = world.getComponent<TransformComponent>(eid, 'Transform')!
          if (distSq(tf.x, tf.y, etf.x, etf.y) < threshold * threshold) return true
        }
        return false
      }
      case 'onInterval':
        // cooldownMax 已经设置为 triggerValue，冷却归零即触发
        return true
      case 'onSpawn':
        return false // 由 ScriptSystem 在创建时处理
      case 'onDestroy':
        return false // 由销毁钩子处理
      default:
        return false
    }
    void dt // suppress lint
  }

  private _executeAction(
    world: World, _entity: number,
    tf: TransformComponent, beh: BehaviorEntry,
  ): void {
    switch (beh.action) {
      case 'Spawn': {
        const count = (beh.actionParams.count as number) ?? 2
        for (let i = 0; i < count; i++) {
          const angle = (i / count) * Math.PI * 2
          const child = world.createEntity()
          const ctf = createTransform(
            tf.x + Math.cos(angle) * 25,
            tf.y + Math.sin(angle) * 25,
          )
          ctf.vx = Math.cos(angle) * 300
          ctf.vy = Math.sin(angle) * 300
          world
            .addComponent(child, ctf)
            .addComponent(child, createRender(5, '#ffcc44', '子刃'))
            .addComponent(child, createSpirituality(30))
            .addComponent(child, createCircleCollider(5, 0.2, {
              layer: LAYER_ARTIFACT, mask: LAYER_ENEMY,
            }))
            .addComponent(child, createTag('projectile'))
        }
        break
      }
      case 'ApplyBuff': {
        const name = (beh.actionParams.name as string) ?? '毒'
        const dur = (beh.actionParams.duration as number) ?? 3
        const dot = (beh.actionParams.dotPerSec as number) ?? 10
        const speedMul = (beh.actionParams.speedMul as number) ?? 1.0
        // 对附近敌人施加 buff
        const enemies = world.query(['Transform', 'Health'])
        for (const eid of enemies) {
          const etf = world.getComponent<TransformComponent>(eid, 'Transform')!
          if (distSq(tf.x, tf.y, etf.x, etf.y) > 60 * 60) continue
          const inst = world.getComponent<ArtifactInstanceComponent>(eid, 'ArtifactInstance')
          if (inst) continue // 不对法宝施 buff
          let buff = world.getComponent<BuffComponent>(eid, 'Buff')
          if (!buff) {
            buff = createBuff([])
            world.addComponent(eid, buff)
          }
          buff.effects.push({ name, remaining: dur, dotPerSec: dot, speedMul })
        }
        break
      }
      case 'Explode': {
        const radius = (beh.actionParams.radius as number) ?? 60
        const damage = (beh.actionParams.damage as number) ?? 50
        const enemies = world.query(['Transform', 'Health'])
        for (const eid of enemies) {
          const etf = world.getComponent<TransformComponent>(eid, 'Transform')!
          if (distSq(tf.x, tf.y, etf.x, etf.y) > radius * radius) continue
          const hp = world.getComponent<HealthComponent>(eid, 'Health')!
          hp.current = Math.max(0, hp.current - damage)
        }
        break
      }
    }
  }

  private _tickBuffs(world: World, dt: number): void {
    const entities = world.query(['Buff', 'Health'])
    for (const entity of entities) {
      const buff = world.getComponent<BuffComponent>(entity, 'Buff')!
      const hp = world.getComponent<HealthComponent>(entity, 'Health')!

      buff.effects = buff.effects.filter(e => {
        e.remaining -= dt
        hp.current = Math.max(0, hp.current - e.dotPerSec * dt)
        return e.remaining > 0
      })

      if (buff.effects.length === 0) {
        world.removeComponent(entity, 'Buff')
      }
    }
  }
}
