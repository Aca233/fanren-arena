import type { System } from '../ecs/types'
import type { World } from '../ecs/World'
import type { TransformComponent } from '../components/Transform'
import type { AuraComponent } from '../components/Aura'
import type { ArtifactInstanceComponent } from '../components/ArtifactInstance'
import type { HealthComponent, SpiritualityComponent } from '../components/Stats'
import type { TagComponent } from '../components/Tag'
import type { MovementComponent } from '../components/Movement'
import { distSq, normalize } from '../physics/collision'

/**
 * AuraSystem —— 第三层：领域与光环
 *
 * 每帧扫描所有带 Aura 组件的实体，对半径内的目标施加效果：
 *   gravity    — 拉向中心
 *   repulsion  — 推离中心
 *   slow       — 减速（修改 Movement.speed）
 *   blind      — 致盲（标记，其他系统读取）
 *   confiscate — 没收（吞噬靠近法宝的灵性）
 *   damage     — 持续伤害
 */
export class AuraSystem implements System {
  readonly name = 'AuraSystem'

  update(world: World, dt: number): void {
    const auraEntities = world.query(['Transform', 'Aura'])

    for (const entity of auraEntities) {
      const tf = world.getComponent<TransformComponent>(entity, 'Transform')!
      const aura = world.getComponent<AuraComponent>(entity, 'Aura')!
      const radiusSq = aura.radius * aura.radius

      // 获取自身所属实例，避免影响自己的主人
      const selfInst = world.getComponent<ArtifactInstanceComponent>(entity, 'ArtifactInstance')
      const ownerId = selfInst?.ownerId ?? -1

      // 扫描所有带 Transform 的实体
      const targets = world.query(['Transform'])
      for (const tid of targets) {
        if (tid === entity) continue
        if (tid === ownerId) continue // 不影响自己主人

        const ttf = world.getComponent<TransformComponent>(tid, 'Transform')!
        const dsq = distSq(tf.x, tf.y, ttf.x, ttf.y)
        if (dsq >= radiusSq) continue

        // 标签过滤
        if (aura.affectsTags) {
          const tag = world.getComponent<TagComponent>(tid, 'Tag')
          if (tag) {
            const hasMatch = aura.affectsTags.some(t => tag.tags.has(t))
            if (!hasMatch) continue
          }
        }

        const dist = Math.sqrt(dsq)
        const closeness = 1 - dist / aura.radius // 0(边缘) ~ 1(中心)

        this._applyEffect(world, aura, tf, ttf, tid, dt, closeness)
      }
    }
  }

  private _applyEffect(
    world: World, aura: AuraComponent,
    center: TransformComponent, target: TransformComponent,
    targetId: number, dt: number, closeness: number,
  ): void {
    const force = aura.strength * closeness * 100 * dt
    const dir = normalize(center.x - target.x, center.y - target.y)

    switch (aura.effect) {
      case 'gravity': {
        target.vx += dir.x * force
        target.vy += dir.y * force
        target.x += dir.x * force * dt
        target.y += dir.y * force * dt
        break
      }
      case 'repulsion': {
        target.vx -= dir.x * force
        target.vy -= dir.y * force
        target.x -= dir.x * force * dt
        target.y -= dir.y * force * dt
        break
      }
      case 'slow': {
        const mv = world.getComponent<MovementComponent>(targetId, 'Movement')
        if (mv) {
          mv.speed = mv.baseSpeed * Math.max(0.2, 1 - aura.strength * 0.1 * closeness)
        }
        break
      }
      case 'blind': {
        // 标记为致盲状态（其他系统可读取）
        world.globals[`blind_${targetId}`] = true
        break
      }
      case 'confiscate': {
        // 吞噬靠近法宝的灵性
        if (closeness > 0.6) {
          const sp = world.getComponent<SpiritualityComponent>(targetId, 'Spirituality')
          if (sp) {
            const drain = aura.strength * 20 * dt
            sp.current = Math.max(0, sp.current - drain)
            if (sp.current <= 0) world.destroyEntity(targetId)
          }
        }
        break
      }
      case 'damage': {
        const hp = world.getComponent<HealthComponent>(targetId, 'Health')
        if (hp) {
          hp.current = Math.max(0, hp.current - aura.strength * 15 * dt * closeness)
        }
        break
      }
    }
  }
}
