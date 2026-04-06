import type { System } from '../ecs/types'
import type { World } from '../ecs/World'
import type { Entity } from '../ecs/types'
import type { TransformComponent } from '../components/Transform'
import type { ColliderComponent } from '../components/Collider'
import type { ProjectileComponent } from '../components/Projectile'
import type { HealthComponent, SpiritualityComponent } from '../components/Stats'
import type { ArtifactInstanceComponent } from '../components/ArtifactInstance'
import type { DivineSenseComponent } from '../components/DivineSense'
import { circleVsCircle, circleVsAabb, makeAABB } from '../physics/collision'

export interface CollisionEvent {
  entityA: Entity
  entityB: Entity
  depth: number
  nx: number
  ny: number
}

/**
 * CollisionSystem —— 碰撞检测与三级结算
 *
 * 弹幕 vs 敌人：扣血 + 销毁
 * 法宝 vs 法宝三级结算：
 *   ① 弹开僵直（重量比 < 3:1）：双方灵性 -10%，失控 0.5s
 *   ② 角力对耗（持续接触）：每秒灵性 -5%，法力 -3%
 *   ③ 碾压击毁（重量比 > 5:1）：轻者直接销毁，主人神识反噬 0.8s
 */
export class CollisionSystem implements System {
  readonly name = 'CollisionSystem'

  events: CollisionEvent[] = []

  /** 角力对耗 —— 跟踪持续接触中的法宝对 */
  private grapplePairs = new Map<string, number>()

  update(world: World, dt: number): void {
    this.events = []
    const currentGrapples = new Set<string>()

    const entities = world.query(['Transform', 'Collider'])
    if (entities.length < 2) return

    for (let i = 0; i < entities.length; i++) {
      for (let j = i + 1; j < entities.length; j++) {
        const a = entities[i]
        const b = entities[j]

        const ca = world.getComponent<ColliderComponent>(a, 'Collider')!
        const cb = world.getComponent<ColliderComponent>(b, 'Collider')!

        if (!(ca.layer & cb.mask) && !(cb.layer & ca.mask)) continue
        if (world.hasComponent(a, 'Invincible') || world.hasComponent(b, 'Invincible')) continue

        const ta = world.getComponent<TransformComponent>(a, 'Transform')!
        const tb = world.getComponent<TransformComponent>(b, 'Transform')!

        let result
        if (ca.shape === 'circle' && cb.shape === 'circle') {
          result = circleVsCircle(ta.x, ta.y, ca.rx, tb.x, tb.y, cb.rx)
        } else if (ca.shape === 'circle' && cb.shape === 'aabb') {
          result = circleVsAabb(ta.x, ta.y, ca.rx, makeAABB(tb.x, tb.y, cb.rx, cb.ry))
        } else if (ca.shape === 'aabb' && cb.shape === 'circle') {
          result = circleVsAabb(tb.x, tb.y, cb.rx, makeAABB(ta.x, ta.y, ca.rx, ca.ry))
          if (result.hit) result = { ...result, nx: -result.nx, ny: -result.ny }
        } else {
          const aabbA = makeAABB(ta.x, ta.y, ca.rx, ca.ry)
          const aabbB = makeAABB(tb.x, tb.y, cb.rx, cb.ry)
          const overlapX = Math.min(aabbA.maxX, aabbB.maxX) - Math.max(aabbA.minX, aabbB.minX)
          const overlapY = Math.min(aabbA.maxY, aabbB.maxY) - Math.max(aabbA.minY, aabbB.minY)
          result = overlapX > 0 && overlapY > 0
            ? { hit: true, depth: Math.min(overlapX, overlapY), nx: overlapX < overlapY ? 1 : 0, ny: overlapX < overlapY ? 0 : 1 }
            : { hit: false, depth: 0, nx: 0, ny: 0 }
        }

        if (!result.hit) continue
        this.events.push({ entityA: a, entityB: b, depth: result.depth, nx: result.nx, ny: result.ny })

        // ── 判定类型 ──
        const instA = world.getComponent<ArtifactInstanceComponent>(a, 'ArtifactInstance')
        const instB = world.getComponent<ArtifactInstanceComponent>(b, 'ArtifactInstance')

        if (instA && instB) {
          // ▶ 法宝 vs 法宝：三级结算
          this._resolveArtifactCollision(world, a, b, ca, cb, ta, tb, result, instA, instB, dt, currentGrapples)
        } else {
          // ▶ 弹幕结算
          this._resolveProjectileHit(world, a, b)
          this._resolveProjectileHit(world, b, a)

          // ▶ 普通推开（非 trigger）
          if (!ca.isTrigger && !cb.isTrigger) {
            const totalMass = ca.weight + cb.weight
            const ratioA = cb.weight / totalMass
            const ratioB = ca.weight / totalMass
            ta.x += result.nx * result.depth * ratioA
            ta.y += result.ny * result.depth * ratioA
            tb.x -= result.nx * result.depth * ratioB
            tb.y -= result.ny * result.depth * ratioB
          }
        }
      }
    }

    // 清理不再接触的角力对
    for (const key of this.grapplePairs.keys()) {
      if (!currentGrapples.has(key)) this.grapplePairs.delete(key)
    }

    world.globals.collisionEvents = this.events
  }

  /** 法宝 vs 法宝三级结算 */
  private _resolveArtifactCollision(
    world: World,
    a: Entity, b: Entity,
    ca: ColliderComponent, cb: ColliderComponent,
    ta: TransformComponent, tb: TransformComponent,
    result: { depth: number; nx: number; ny: number },
    instA: ArtifactInstanceComponent, instB: ArtifactInstanceComponent,
    dt: number, currentGrapples: Set<string>,
  ): void {
    const heavy = ca.weight >= cb.weight ? ca.weight : cb.weight
    const light = ca.weight < cb.weight ? ca.weight : cb.weight
    const ratio = heavy / light
    const heavyIsA = ca.weight >= cb.weight

    // ── ③ 碾压击毁（重量比 > 5:1）──
    if (ratio > 5) {
      const loser = heavyIsA ? b : a
      const loserInst = heavyIsA ? instB : instA
      const loserSp = world.getComponent<SpiritualityComponent>(loser, 'Spirituality')
      if (loserSp) loserSp.current = 0

      // 主人神识反噬
      const ownerDs = world.getComponent<DivineSenseComponent>(loserInst.ownerId, 'DivineSense')
      if (ownerDs) {
        ownerDs.overloaded = true
        ownerDs.overloadStun = 0.8
      }

      world.destroyEntity(loser)
      return
    }

    // ── ① 弹开僵直（首次碰撞，重量比 < 3:1）──
    const pairKey = a < b ? `${a}:${b}` : `${b}:${a}`
    const grappleTime = this.grapplePairs.get(pairKey) ?? 0

    if (grappleTime < 0.05) {
      // 首帧碰撞 → 弹开
      const spA = world.getComponent<SpiritualityComponent>(a, 'Spirituality')
      const spB = world.getComponent<SpiritualityComponent>(b, 'Spirituality')
      if (spA) spA.current = Math.max(0, spA.current - spA.max * 0.1)
      if (spB) spB.current = Math.max(0, spB.current - spB.max * 0.1)

      // 弹开速度
      const bounce = 200
      ta.vx = result.nx * bounce
      ta.vy = result.ny * bounce
      tb.vx = -result.nx * bounce
      tb.vy = -result.ny * bounce

      // 推开
      ta.x += result.nx * result.depth * 0.5
      ta.y += result.ny * result.depth * 0.5
      tb.x -= result.nx * result.depth * 0.5
      tb.y -= result.ny * result.depth * 0.5

      // 僵直 0.5s
      if (instA.state !== 'stunned') {
        instA.state = 'stunned'
        instA.stunRemaining = 0.5
      }
      if (instB.state !== 'stunned') {
        instB.state = 'stunned'
        instB.stunRemaining = 0.5
      }
    }

    // ── ② 角力对耗（持续接触 > 0.05s）──
    currentGrapples.add(pairKey)
    this.grapplePairs.set(pairKey, grappleTime + dt)

    if (grappleTime >= 0.05) {
      const spA = world.getComponent<SpiritualityComponent>(a, 'Spirituality')
      const spB = world.getComponent<SpiritualityComponent>(b, 'Spirituality')
      const drainRate = 0.05 * dt // 每秒 5%
      if (spA) spA.current = Math.max(0, spA.current - spA.max * drainRate)
      if (spB) spB.current = Math.max(0, spB.current - spB.max * drainRate)

      // 灵性归零 → 销毁
      if (spA && spA.current <= 0) world.destroyEntity(a)
      if (spB && spB.current <= 0) world.destroyEntity(b)
    }
  }

  private _resolveProjectileHit(world: World, projectileId: Entity, targetId: Entity): void {
    const pj = world.getComponent<ProjectileComponent>(projectileId, 'Projectile')
    if (!pj) return
    if (pj.ownerId === targetId) return

    const hp = world.getComponent<HealthComponent>(targetId, 'Health')
    if (hp) hp.current = Math.max(0, hp.current - pj.damage)

    pj.hitCount++
    if (pj.hitCount > pj.piercing) world.destroyEntity(projectileId)
  }
}
