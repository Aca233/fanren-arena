import type { System } from '../ecs/types'
import type { World } from '../ecs/World'
import type { TransformComponent } from '../components/Transform'
import type { HealthComponent } from '../components/Stats'
import type { CollisionEvent } from './CollisionSystem'
import type { CounterEvent } from './TagCounterSystem'
import { ParticleEngine, CameraShake, DamageNumberManager } from '../vfx/ParticleEngine'

/**
 * VFXSystem —— 视觉特效系统
 *
 * 监听碰撞事件与克制事件，自动生成粒子、屏幕震动、伤害飘字
 */
export class VFXSystem implements System {
  readonly name = 'VFXSystem'

  readonly particles = new ParticleEngine()
  readonly shake = new CameraShake()
  readonly dmgNumbers = new DamageNumberManager()

  private ctx: CanvasRenderingContext2D | null = null
  private prevHpSnapshot = new Map<number, number>()

  setContext(ctx: CanvasRenderingContext2D): void {
    this.ctx = ctx
  }

  update(world: World, dt: number): void {
    // ── 碰撞火花 ──
    const collisions = (world.globals.collisionEvents ?? []) as CollisionEvent[]
    for (const ev of collisions) {
      const tfA = world.getComponent<TransformComponent>(ev.entityA, 'Transform')
      const tfB = world.getComponent<TransformComponent>(ev.entityB, 'Transform')
      if (tfA && tfB) {
        const mx = (tfA.x + tfB.x) / 2
        const my = (tfA.y + tfB.y) / 2
        this.particles.emit(mx, my, 6, {
          speedMin: 80, speedMax: 220,
          sizeMin: 1.5, sizeMax: 4,
          life: 0.3,
          color: { r: 255, g: 180, b: 60 },
        })

        // 轻微震动
        this.shake.trigger(3, 0.1)
      }
    }

    // ── 克制特效 ──
    const counters = (world.globals.counterEvents ?? []) as CounterEvent[]
    for (const ev of counters) {
      const tf = world.getComponent<TransformComponent>(ev.defender, 'Transform')
      if (!tf) continue

      // 克制时大震动 + 特殊颜色粒子
      const colors: Record<string, { r: number; g: number; b: number }> = {
        purify: { r: 255, g: 255, b: 200 },
        melt: { r: 255, g: 120, b: 40 },
        quench: { r: 100, g: 200, b: 255 },
        freeze: { r: 150, g: 220, b: 255 },
        ground: { r: 180, g: 160, b: 100 },
      }
      this.particles.emit(tf.x, tf.y, 15, {
        speedMin: 100, speedMax: 350,
        sizeMin: 2, sizeMax: 6,
        life: 0.5,
        color: colors[ev.effect] ?? { r: 255, g: 255, b: 255 },
      })
      this.shake.trigger(6, 0.2)

      this.dmgNumbers.spawn(tf.x, tf.y, Math.round(ev.multiplier * 100), '#ffcc00')
    }

    // ── 伤害飘字（检测 HP 变化）──
    const healthEntities = world.query(['Transform', 'Health'])
    for (const eid of healthEntities) {
      const hp = world.getComponent<HealthComponent>(eid, 'Health')!
      const prevHp = this.prevHpSnapshot.get(eid)
      if (prevHp !== undefined && hp.current < prevHp) {
        const tf = world.getComponent<TransformComponent>(eid, 'Transform')!
        const dmg = Math.round(prevHp - hp.current)
        if (dmg > 0) {
          this.dmgNumbers.spawn(tf.x, tf.y - 10, dmg)
          // 小粒子溅血
          this.particles.emit(tf.x, tf.y, 3, {
            speedMin: 30, speedMax: 80,
            sizeMin: 1, sizeMax: 2.5,
            life: 0.25,
            color: { r: 200, g: 50, b: 50 },
          })
        }
      }
      this.prevHpSnapshot.set(eid, hp.current)
    }

    // 清理死亡实体的快照
    for (const eid of this.prevHpSnapshot.keys()) {
      if (!world.isAlive(eid)) this.prevHpSnapshot.delete(eid)
    }

    // ── 更新 ──
    this.particles.update(dt)
    this.shake.update(dt)
    this.dmgNumbers.update(dt)

    // ── 渲染 ──
    if (this.ctx) {
      // 震动偏移
      this.ctx.save()
      this.ctx.translate(this.shake.offsetX, this.shake.offsetY)
      this.particles.render(this.ctx)
      this.dmgNumbers.render(this.ctx)
      this.ctx.restore()

      // 神识过载边缘泛红
      const overloaded = world.globals._divineOverloaded as boolean | undefined
      if (overloaded) {
        const a = 0.15 + Math.sin(Date.now() * 0.008) * 0.1
        this.ctx.fillStyle = `rgba(180, 30, 30, ${a})`
        this.ctx.fillRect(0, 0, this.ctx.canvas.width, this.ctx.canvas.height)
      }
    }
  }
}
