/**
 * ParticleEngine —— 轻量级 Canvas 粒子系统
 *
 * - 粒子池预分配，零 GC
 * - 支持发射器、渐变衰减、重力
 */

export interface Particle {
  alive: boolean
  x: number; y: number
  vx: number; vy: number
  life: number; maxLife: number
  size: number; sizeDecay: number
  r: number; g: number; b: number; a: number
  gravity: number
}

const POOL_SIZE = 500

export class ParticleEngine {
  private readonly pool: Particle[] = []
  private nextIdx = 0

  constructor() {
    for (let i = 0; i < POOL_SIZE; i++) {
      this.pool.push(this._makeParticle())
    }
  }

  /** 发射粒子 */
  emit(
    x: number, y: number, count: number,
    opts?: {
      speedMin?: number; speedMax?: number
      sizeMin?: number; sizeMax?: number
      life?: number
      color?: { r: number; g: number; b: number }
      gravity?: number
      spread?: number // 角度范围 (0 = 全向, π/4 = 锥形)
      angle?: number  // 基准角度
    },
  ): void {
    const speedMin = opts?.speedMin ?? 50
    const speedMax = opts?.speedMax ?? 200
    const sizeMin = opts?.sizeMin ?? 2
    const sizeMax = opts?.sizeMax ?? 5
    const life = opts?.life ?? 0.6
    const color = opts?.color ?? { r: 255, g: 200, b: 100 }
    const gravity = opts?.gravity ?? 0
    const spread = opts?.spread ?? Math.PI * 2
    const baseAngle = opts?.angle ?? 0

    for (let i = 0; i < count; i++) {
      const p = this.pool[this.nextIdx]
      this.nextIdx = (this.nextIdx + 1) % POOL_SIZE

      const angle = baseAngle + (Math.random() - 0.5) * spread
      const speed = speedMin + Math.random() * (speedMax - speedMin)

      p.alive = true
      p.x = x; p.y = y
      p.vx = Math.cos(angle) * speed
      p.vy = Math.sin(angle) * speed
      p.life = life; p.maxLife = life
      p.size = sizeMin + Math.random() * (sizeMax - sizeMin)
      p.sizeDecay = p.size / life
      p.r = color.r; p.g = color.g; p.b = color.b
      p.a = 1
      p.gravity = gravity
    }
  }

  /** 每帧更新 */
  update(dt: number): void {
    for (const p of this.pool) {
      if (!p.alive) continue
      p.life -= dt
      if (p.life <= 0) { p.alive = false; continue }

      p.vy += p.gravity * dt
      p.x += p.vx * dt
      p.y += p.vy * dt
      p.a = p.life / p.maxLife
      p.size = Math.max(0.5, p.size - p.sizeDecay * dt)
    }
  }

  /** 渲染到 Canvas */
  render(ctx: CanvasRenderingContext2D): void {
    for (const p of this.pool) {
      if (!p.alive) continue
      ctx.globalAlpha = p.a
      ctx.fillStyle = `rgb(${p.r},${p.g},${p.b})`
      ctx.beginPath()
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.globalAlpha = 1
  }

  private _makeParticle(): Particle {
    return { alive: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, maxLife: 0, size: 0, sizeDecay: 0, r: 255, g: 255, b: 255, a: 0, gravity: 0 }
  }
}

/**
 * 屏幕震动
 */
export class CameraShake {
  private intensity = 0
  private duration = 0
  private timer = 0
  offsetX = 0
  offsetY = 0

  trigger(intensity: number, duration = 0.3): void {
    this.intensity = intensity
    this.duration = duration
    this.timer = 0
  }

  update(dt: number): void {
    if (this.timer >= this.duration) {
      this.offsetX = 0; this.offsetY = 0; return
    }
    this.timer += dt
    const decay = 1 - this.timer / this.duration
    this.offsetX = (Math.random() - 0.5) * this.intensity * decay * 2
    this.offsetY = (Math.random() - 0.5) * this.intensity * decay * 2
  }
}

/**
 * 伤害飘字
 */
export interface DamageNumber {
  x: number; y: number
  value: number
  color: string
  life: number
  vy: number
  scale: number
}

export class DamageNumberManager {
  numbers: DamageNumber[] = []

  spawn(x: number, y: number, value: number, color = '#ff4444'): void {
    this.numbers.push({
      x: x + (Math.random() - 0.5) * 20,
      y,
      value,
      color,
      life: 1.0,
      vy: -80,
      scale: value > 50 ? 1.5 : 1.0,
    })
  }

  update(dt: number): void {
    this.numbers = this.numbers.filter(n => {
      n.life -= dt
      n.y += n.vy * dt
      n.vy += 30 * dt // 轻微减速
      return n.life > 0
    })
  }

  render(ctx: CanvasRenderingContext2D): void {
    for (const n of this.numbers) {
      ctx.globalAlpha = Math.min(1, n.life * 2)
      ctx.fillStyle = n.color
      ctx.font = `bold ${Math.round(14 * n.scale)}px monospace`
      ctx.textAlign = 'center'
      ctx.fillText(`-${n.value}`, n.x, n.y)
    }
    ctx.globalAlpha = 1
  }
}
