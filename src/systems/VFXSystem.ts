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
  private _lightningChains: { x1: number; y1: number; x2: number; y2: number; life: number; maxLife: number }[] = []

  /** 伤害聚合：按目标实体聚合，每 0.5s 显示一次总伤害 */
  private _dmgAccum = new Map<number, number>()
  private _dmgTimer = 0
  private readonly DMG_INTERVAL = 0.5

  /** 碰撞特效节流 */
  private _sparkTimer = 0
  private readonly SPARK_INTERVAL = 0.15

  setContext(ctx: CanvasRenderingContext2D): void {
    this.ctx = ctx
  }

  update(world: World, dt: number): void {
    this._sparkTimer += dt
    this._dmgTimer += dt

    // ── 碰撞火花（节流：每 0.15s 最多一次）──
    const collisions = (world.globals.collisionEvents ?? []) as CollisionEvent[]
    if (collisions.length > 0 && this._sparkTimer >= this.SPARK_INTERVAL) {
      this._sparkTimer = 0
      // 只取第一个碰撞生成火花，避免刷屏
      const ev = collisions[0]
      const tfA = world.getComponent<TransformComponent>(ev.entityA, 'Transform')
      const tfB = world.getComponent<TransformComponent>(ev.entityB, 'Transform')
      if (tfA && tfB) {
        const mx = (tfA.x + tfB.x) / 2
        const my = (tfA.y + tfB.y) / 2
        this.particles.emit(mx, my, 3, {
          speedMin: 60, speedMax: 150,
          sizeMin: 1, sizeMax: 3,
          life: 0.2,
          color: { r: 255, g: 180, b: 60 },
        })
      }
    }

    // ── 克制特效（精简版）──
    const counters = (world.globals.counterEvents ?? []) as CounterEvent[]
    if (counters.length > 0) {
      // 每帧只处理第一个克制事件
      const ev = counters[0]
      const tf = world.getComponent<TransformComponent>(ev.defender, 'Transform')
      if (tf) {
        const colors: Record<string, { r: number; g: number; b: number }> = {
          purify: { r: 255, g: 255, b: 200 },
          melt: { r: 255, g: 120, b: 40 },
          quench: { r: 100, g: 200, b: 255 },
          freeze: { r: 150, g: 220, b: 255 },
          ground: { r: 180, g: 160, b: 100 },
        }
        this.particles.emit(tf.x, tf.y, 8, {
          speedMin: 80, speedMax: 250,
          sizeMin: 1.5, sizeMax: 4,
          life: 0.35,
          color: colors[ev.effect] ?? { r: 255, g: 255, b: 255 },
        })
        this.shake.trigger(4, 0.15)

        // 辟邪神雷闪电链
        if (ev.effect === 'purify') {
          const atkTf = world.getComponent<TransformComponent>(ev.attacker, 'Transform')
          if (atkTf) {
            this._lightningChains.push({
              x1: atkTf.x, y1: atkTf.y,
              x2: tf.x, y2: tf.y,
              life: 0.25, maxLife: 0.25,
            })
          }
          this.particles.emit(tf.x, tf.y, 12, {
            speedMin: 100, speedMax: 350,
            sizeMin: 1, sizeMax: 3,
            life: 0.3,
            color: { r: 255, g: 230, b: 100 },
          })
          this.shake.trigger(6, 0.2)
        }
      }
    }

    // ── 伤害聚合飘字（按实体累积，每 0.5s 显示一次）──
    const healthEntities = world.query(['Transform', 'Health'])
    for (const eid of healthEntities) {
      const hp = world.getComponent<HealthComponent>(eid, 'Health')!
      const prevHp = this.prevHpSnapshot.get(eid)
      if (prevHp !== undefined && hp.current < prevHp) {
        const dmg = prevHp - hp.current
        this._dmgAccum.set(eid, (this._dmgAccum.get(eid) ?? 0) + dmg)
      }
      this.prevHpSnapshot.set(eid, hp.current)
    }

    // 定时输出聚合伤害
    if (this._dmgTimer >= this.DMG_INTERVAL) {
      this._dmgTimer = 0
      for (const [eid, total] of this._dmgAccum) {
        if (total < 1) continue
        if (!world.isAlive(eid)) continue
        const tf = world.getComponent<TransformComponent>(eid, 'Transform')
        if (tf) {
          this.dmgNumbers.spawn(tf.x, tf.y - 15, Math.round(total))
        }
      }
      this._dmgAccum.clear()
    }

    // 清理死亡实体
    for (const eid of this.prevHpSnapshot.keys()) {
      if (!world.isAlive(eid)) { this.prevHpSnapshot.delete(eid); this._dmgAccum.delete(eid) }
    }

    // ── 更新 ──
    this.particles.update(dt)
    this.shake.update(dt)
    this.dmgNumbers.update(dt)

    // 闪电链衰减
    this._lightningChains = this._lightningChains.filter(lc => {
      lc.life -= dt
      return lc.life > 0
    })

    // ── 渲染 ──
    if (this.ctx) {
      // 震动偏移
      this.ctx.save()
      this.ctx.translate(this.shake.offsetX, this.shake.offsetY)
      this.particles.render(this.ctx)
      this.dmgNumbers.render(this.ctx)

      // 辟邪神雷闪电链
      for (const lc of this._lightningChains) {
        const alpha = lc.life / lc.maxLife
        this._drawLightning(this.ctx, lc.x1, lc.y1, lc.x2, lc.y2, alpha)
      }

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

  /** 绘制锯齿闪电折线 */
  private _drawLightning(
    ctx: CanvasRenderingContext2D,
    x1: number, y1: number, x2: number, y2: number,
    alpha: number,
  ): void {
    const segments = 8
    const dx = x2 - x1
    const dy = y2 - y1
    const len = Math.sqrt(dx * dx + dy * dy)
    const nx = -dy / len  // 法线方向
    const ny = dx / len

    ctx.beginPath()
    ctx.moveTo(x1, y1)
    for (let i = 1; i < segments; i++) {
      const t = i / segments
      const baseX = x1 + dx * t
      const baseY = y1 + dy * t
      const jitter = (Math.random() - 0.5) * len * 0.15
      ctx.lineTo(baseX + nx * jitter, baseY + ny * jitter)
    }
    ctx.lineTo(x2, y2)

    // 外层粗亮光
    ctx.strokeStyle = `rgba(255, 230, 100, ${alpha * 0.6})`
    ctx.lineWidth = 4
    ctx.stroke()

    // 内层细白芯
    ctx.strokeStyle = `rgba(255, 255, 240, ${alpha})`
    ctx.lineWidth = 1.5
    ctx.stroke()

    // 分叉（从中段随机分出短支线）
    if (Math.random() > 0.3) {
      const bt = 0.3 + Math.random() * 0.4
      const bx = x1 + dx * bt
      const by = y1 + dy * bt
      const forkLen = len * 0.25
      const forkAngle = Math.atan2(dy, dx) + (Math.random() - 0.5) * 1.2
      ctx.beginPath()
      ctx.moveTo(bx, by)
      ctx.lineTo(
        bx + Math.cos(forkAngle) * forkLen + (Math.random() - 0.5) * 10,
        by + Math.sin(forkAngle) * forkLen + (Math.random() - 0.5) * 10,
      )
      ctx.strokeStyle = `rgba(255, 220, 80, ${alpha * 0.4})`
      ctx.lineWidth = 1.5
      ctx.stroke()
    }
  }
}
