import type { System } from '../ecs/types'
import type { World } from '../ecs/World'
import type { TransformComponent } from '../components/Transform'
import type { RenderComponent } from '../components/Render'
import type { HealthComponent, SpiritualityComponent } from '../components/Stats'
import type { ArtifactInstanceComponent } from '../components/ArtifactInstance'
import type { AuraComponent } from '../components/Aura'
import type { TrailComponent } from '../components/SwordFormation'
import { GLRenderer } from '../vfx/GLRenderer'

/**
 * WebGLRenderSystem —— 双层渲染
 *
 * 底层：WebGL2 实例化渲染（实体/飞剑/粒子）— 单次 draw call
 * 顶层：Canvas 2D 叠加（血条/文字/领域阵纹/剑丝/闪电）
 */
export class WebGLRenderSystem implements System {
  readonly name = 'WebGLRenderSystem'

  private gl: GLRenderer | null = null
  private ctx: CanvasRenderingContext2D | null = null
  private width = 900
  private height = 580

  setup(
    glCanvas: HTMLCanvasElement,
    overlayCanvas: HTMLCanvasElement,
    w: number, h: number,
  ): void {
    this.width = w
    this.height = h
    this.gl = new GLRenderer(glCanvas, w, h)

    const dpr = window.devicePixelRatio || 1
    overlayCanvas.width = w * dpr
    overlayCanvas.height = h * dpr
    overlayCanvas.style.width = `${w}px`
    overlayCanvas.style.height = `${h}px`
    this.ctx = overlayCanvas.getContext('2d')!
    this.ctx.scale(dpr, dpr)
  }

  update(world: World, _dt: number): void {
    if (!this.gl || !this.ctx) return
    const gl = this.gl
    const ctx = this.ctx

    // ── WebGL 层：实体 ──
    gl.begin()

    // 网格背景（用细小粒子模拟）
    for (let x = 30; x < this.width; x += 60) {
      for (let y = 30; y < this.height; y += 60) {
        gl.push({ x, y, rotation: 0, scale: 2, r: 0.1, g: 0.1, b: 0.18, a: 0.5, texId: 0 })
      }
    }

    const transforms = world.getAllWithComponent<TransformComponent>('Transform')
    const renders = world.getAllWithComponent<RenderComponent>('Render')

    for (const [entity, render] of renders) {
      if (!render.visible) continue
      const tf = transforms.get(entity)
      if (!tf) continue

      const hasTrail = world.hasComponent(entity, 'Trail')
      const isInvincible = world.hasComponent(entity, 'Invincible')

      // 颜色解析
      const c = this._parseColor(isInvincible ? '#ffffff' : render.color)

      // 僵直闪烁
      const inst = world.getComponent<ArtifactInstanceComponent>(entity, 'ArtifactInstance')
      let alpha = c.a
      if (inst && inst.state === 'stunned') alpha *= 0.4 + Math.sin(Date.now() * 0.02) * 0.3
      if (isInvincible) alpha *= 0.5 + Math.sin(Date.now() * 0.03) * 0.3

      if (hasTrail && render.radius <= 5) {
        // 飞剑 → texId=1 (剑纹理)
        const isSplit = world.globals[`_splitSword_${entity}`] as boolean | undefined
        const swordScale = isSplit ? 45 : 70
        gl.push({
          x: tf.x, y: tf.y,
          rotation: tf.rotation + Math.PI * 0.75,
          scale: swordScale,
          r: c.r, g: c.g, b: c.b, a: isSplit ? alpha * 0.7 : alpha,
          texId: 1,
        })
      } else {
        // 普通实体 → texId=0 (圆形)
        gl.push({
          x: tf.x, y: tf.y,
          rotation: tf.rotation,
          scale: render.radius * 2,
          r: c.r, g: c.g, b: c.b, a: alpha,
          texId: 0,
        })
      }

      // 发光效果（放大的半透明圆）
      if (render.glowColor) {
        const gc = this._parseColor(render.glowColor)
        gl.push({
          x: tf.x, y: tf.y,
          rotation: 0,
          scale: render.radius * 3.5,
          r: gc.r, g: gc.g, b: gc.b, a: gc.a * 0.3,
          texId: 2,
        })
      }
    }

    // 飞剑拖尾（渐隐渐细的光带）
    const trails = world.getAllWithComponent<TrailComponent>('Trail')
    for (const [entity, trail] of trails) {
      if (trail.positions.length < 2) continue
      const isSplit = world.globals[`_splitSword_${entity}`] as boolean | undefined
      for (let i = 1; i < trail.positions.length; i++) {
        const p = trail.positions[i]
        const prev = trail.positions[i - 1]
        const t = i / trail.positions.length
        const alpha = (1 - t) * (isSplit ? 0.15 : 0.35)
        const size = Math.max(1, trail.width * 3 * (1 - t * 0.8))
        // 连线段中间点
        const mx = (p.x + prev.x) / 2, my = (p.y + prev.y) / 2
        gl.push({
          x: mx, y: my,
          rotation: Math.atan2(p.y - prev.y, p.x - prev.x),
          scale: size,
          r: 0.85, g: 0.75, b: 0.3, a: alpha,
          texId: 2,
        })
      }
    }

    gl.flush() // 单次 draw call！

    // ── Canvas 2D 叠加层：全部 UI 特效 ──
    ctx.clearRect(0, 0, this.width, this.height)

    // 环境暗化
    const darken = (world.globals.domainDarken ?? 0) as number
    if (darken > 0) {
      ctx.fillStyle = `rgba(0,0,0,${darken})`
      ctx.fillRect(0, 0, this.width, this.height)
    }

    // 贝塞尔划线预览
    const preview = world.globals.bezierPreview as { x: number; y: number }[] | null
    if (preview && preview.length >= 2) {
      ctx.beginPath()
      ctx.moveTo(preview[0].x, preview[0].y)
      for (let i = 1; i < preview.length; i++) ctx.lineTo(preview[i].x, preview[i].y)
      ctx.strokeStyle = '#ffaa0088'
      ctx.lineWidth = 2
      ctx.setLineDash([6, 4])
      ctx.stroke()
      ctx.setLineDash([])
    }

    // 飞剑周边翠绿丝线
    for (const [entity, render] of renders) {
      if (!render.visible) continue
      const hasTrail = world.hasComponent(entity, 'Trail')
      if (!hasTrail || render.radius > 5) continue
      const tf = transforms.get(entity)
      if (!tf) continue
      const isSplit = world.globals[`_splitSword_${entity}`] as boolean | undefined
      const silkCount = isSplit ? 2 : 3
      const silkLen = isSplit ? 8 : 14
      const t = Date.now() * 0.004 + entity * 1.3
      ctx.strokeStyle = `rgba(120,220,100,${isSplit ? 0.08 : 0.15})`
      ctx.lineWidth = 0.6
      for (let j = 0; j < silkCount; j++) {
        const a = t + (j / silkCount) * Math.PI * 2
        const x1 = tf.x + Math.cos(a) * 4
        const y1 = tf.y + Math.sin(a) * 4
        const x2 = tf.x + Math.cos(a + 0.3) * silkLen
        const y2 = tf.y + Math.sin(a + 0.3) * silkLen
        ctx.beginPath()
        ctx.moveTo(x1, y1)
        ctx.lineTo(x2, y2)
        ctx.stroke()
      }
    }

    // 领域光环圈（AuraComponent）
    const auraEntities = world.query(['Transform', 'Aura'])
    for (const entity of auraEntities) {
      const tf = world.getComponent<TransformComponent>(entity, 'Transform')!
      const aura = world.getComponent<AuraComponent>(entity, 'Aura')!
      const effectColors: Record<string, string> = {
        gravity: '#22886644', repulsion: '#88222244', slow: '#4444aa44',
        blind: '#44444488', confiscate: '#88440044', damage: '#aa222244',
      }
      ctx.beginPath()
      ctx.arc(tf.x, tf.y, aura.radius, 0, Math.PI * 2)
      ctx.fillStyle = effectColors[aura.effect] ?? '#ffffff22'
      ctx.fill()
      ctx.strokeStyle = (effectColors[aura.effect] ?? '#ffffff22').slice(0, 7) + '88'
      ctx.lineWidth = 1
      ctx.setLineDash([4, 4])
      ctx.stroke()
      ctx.setLineDash([])
      ctx.fillStyle = '#ffffff66'
      ctx.font = '9px monospace'
      ctx.textAlign = 'center'
      ctx.fillText(aura.effect, tf.x, tf.y + aura.radius + 10)
    }

    // 大庚剑阵
    this._drawDomain(world, ctx)

    // 实体叠加：追踪线/状态标签/朝向线/血条/标签
    for (const [entity, render] of renders) {
      if (!render.visible) continue
      const tf = transforms.get(entity)
      if (!tf) continue
      const hasTrail = world.hasComponent(entity, 'Trail')
      const inst = world.getComponent<ArtifactInstanceComponent>(entity, 'ArtifactInstance')

      // 法宝追踪线（虚线）
      if (inst && inst.state === 'chasing' && world.isAlive(inst.targetId)) {
        const targetTf = transforms.get(inst.targetId)
        if (targetTf) {
          ctx.beginPath()
          ctx.moveTo(tf.x, tf.y)
          ctx.lineTo(targetTf.x, targetTf.y)
          ctx.strokeStyle = '#ff444433'
          ctx.lineWidth = 1
          ctx.setLineDash([4, 4])
          ctx.stroke()
          ctx.setLineDash([])
        }
      }

      // 法宝状态标签
      if (inst) {
        const stateLabel = inst.state === 'chasing' ? '⚔' :
          inst.state === 'bezier' ? '↝' :
          inst.state === 'stunned' ? '✧' :
          inst.state === 'returning' ? '↩' : ''
        if (stateLabel) {
          ctx.fillStyle = '#ffffffcc'
          ctx.font = '10px monospace'
          ctx.textAlign = 'center'
          ctx.fillText(stateLabel, tf.x, tf.y - render.radius - 14)
        }
      }

      // 朝向指示线
      if (!hasTrail && render.radius > 5) {
        ctx.beginPath()
        ctx.moveTo(tf.x, tf.y)
        ctx.lineTo(
          tf.x + Math.cos(tf.rotation) * render.radius * 1.4,
          tf.y + Math.sin(tf.rotation) * render.radius * 1.4,
        )
        ctx.strokeStyle = '#ffffff44'
        ctx.lineWidth = 1.5
        ctx.stroke()
      }

      // 标签
      if (render.label) {
        ctx.fillStyle = '#e8e0d0cc'
        ctx.font = '11px monospace'
        ctx.textAlign = 'center'
        ctx.fillText(render.label, tf.x, tf.y - render.radius - 5)
      }

      // 血条（非飞剑）
      if (!hasTrail) {
        const hp = world.getComponent<HealthComponent>(entity, 'Health')
        if (hp) this._drawBar(ctx, tf.x, tf.y + render.radius + 4, render.radius * 2.4, 4,
          hp.current / hp.max, hp.current / hp.max > 0.5 ? '#44cc44' : hp.current / hp.max > 0.25 ? '#ccaa22' : '#cc3333')

        const sp = world.getComponent<SpiritualityComponent>(entity, 'Spirituality')
        if (sp) this._drawBar(ctx, tf.x, tf.y + render.radius + 10, render.radius * 2.4, 3,
          sp.current / sp.max, '#4488cc')
      }
    }

    // 神识过载边缘泛红
    const overloaded = world.globals._divineOverloaded as boolean | undefined
    if (overloaded) {
      const a = 0.15 + Math.sin(Date.now() * 0.008) * 0.1
      ctx.fillStyle = `rgba(180, 30, 30, ${a})`
      ctx.fillRect(0, 0, this.width, this.height)
    }
  }

  private _drawDomain(world: World, ctx: CanvasRenderingContext2D): void {
    const dc = world.globals.domainCircle as {
      x: number; y: number; radius: number; timer: number; phase: string
      swordSilks: { x1: number; y1: number; x2: number; y2: number; alpha: number }[]
      deployDuration: number; activeDuration: number
      coreHealth: number; coreHealthMax: number
    } | null
    if (!dc) return

    const { x: cx, y: cy, radius: dr, timer, phase, swordSilks } = dc
    const pulse = 0.7 + Math.sin(timer * 3) * 0.3
    const deployPct = phase === 'deploying' ? Math.min(1, timer / dc.deployDuration) : 1

    // 多层结界环
    ctx.beginPath()
    ctx.arc(cx, cy, dr * deployPct, 0, Math.PI * 2)
    const grad = ctx.createRadialGradient(cx, cy, dr * 0.7 * deployPct, cx, cy, dr * deployPct)
    grad.addColorStop(0, 'rgba(30,60,20,0)')
    grad.addColorStop(0.7, `rgba(60,120,40,${0.06 * pulse})`)
    grad.addColorStop(1, `rgba(180,160,60,${0.12 * pulse})`)
    ctx.fillStyle = grad
    ctx.fill()
    ctx.strokeStyle = `rgba(180,160,60,${0.6 * pulse * deployPct})`
    ctx.lineWidth = 2.5
    ctx.stroke()

    // 中圈 + 内圈
    ctx.beginPath()
    ctx.arc(cx, cy, dr * 0.72 * deployPct, 0, Math.PI * 2)
    ctx.strokeStyle = `rgba(140,200,80,${0.25 * pulse * deployPct})`
    ctx.lineWidth = 1
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(cx, cy, dr * 0.4 * deployPct, 0, Math.PI * 2)
    ctx.strokeStyle = `rgba(200,180,60,${0.2 * pulse * deployPct})`
    ctx.lineWidth = 1.5
    ctx.stroke()

    // 八卦阵纹
    if (deployPct > 0.3) {
      const a8 = deployPct * (phase === 'active' ? 1 : 0.6)
      for (let i = 0; i < 8; i++) {
        const angle = (i / 8) * Math.PI * 2 + timer * 0.4
        ctx.beginPath()
        ctx.moveTo(cx + Math.cos(angle) * dr * 0.08, cy + Math.sin(angle) * dr * 0.08)
        ctx.lineTo(cx + Math.cos(angle) * dr * 0.88 * deployPct, cy + Math.sin(angle) * dr * 0.88 * deployPct)
        ctx.strokeStyle = i % 2 === 0
          ? `rgba(200,180,60,${0.35 * a8})` : `rgba(100,180,60,${0.2 * a8})`
        ctx.lineWidth = i % 2 === 0 ? 1.5 : 1
        ctx.stroke()
      }

      // 旋转弧段
      for (let i = 0; i < 3; i++) {
        const r = dr * (0.3 + i * 0.18) * deployPct
        const startA = timer * (1.2 - i * 0.3) + i * 2.1
        ctx.beginPath()
        ctx.arc(cx, cy, r, startA, startA + Math.PI * 0.8)
        ctx.strokeStyle = `rgba(180,220,80,${0.25 * a8 * pulse})`
        ctx.lineWidth = 1.5
        ctx.stroke()
      }

      // 阵眼核心光点
      const coreGlow = ctx.createRadialGradient(cx, cy, 0, cx, cy, 18)
      coreGlow.addColorStop(0, `rgba(255,240,160,${0.5 * pulse * a8})`)
      coreGlow.addColorStop(1, 'rgba(255,240,160,0)')
      ctx.beginPath()
      ctx.arc(cx, cy, 18, 0, Math.PI * 2)
      ctx.fillStyle = coreGlow
      ctx.fill()
    }

    // 剑丝（三层渲染）
    for (const silk of swordSilks) {
      ctx.beginPath()
      ctx.moveTo(silk.x1, silk.y1)
      ctx.lineTo(silk.x2, silk.y2)
      ctx.strokeStyle = `rgba(140,220,80,${silk.alpha * 0.25})`
      ctx.lineWidth = 5
      ctx.stroke()
      ctx.strokeStyle = `rgba(220,200,80,${silk.alpha * 0.5})`
      ctx.lineWidth = 2
      ctx.stroke()
      ctx.strokeStyle = `rgba(255,255,240,${silk.alpha * 0.9})`
      ctx.lineWidth = 0.8
      ctx.stroke()
    }

    // 阵眼血条
    if (phase === 'active') {
      const pct = dc.coreHealth / dc.coreHealthMax
      const barGrad = ctx.createLinearGradient(cx - 35, 0, cx + 35, 0)
      barGrad.addColorStop(0, pct > 0.5 ? '#88cc44' : '#cc8822')
      barGrad.addColorStop(1, pct > 0.5 ? '#d4af37' : '#cc3333')
      ctx.fillStyle = '#0a0a0a88'
      ctx.fillRect(cx - 36, cy + dr + 5, 72, 6)
      ctx.fillStyle = barGrad
      ctx.fillRect(cx - 35, cy + dr + 6, 70 * pct, 4)
    }

    const label = phase === 'deploying' ? `布阵 ${(dc.deployDuration - timer).toFixed(1)}s`
      : phase === 'active' ? `大庚剑阵 ${(dc.activeDuration - timer).toFixed(1)}s` : '收阵…'
    ctx.fillStyle = '#d4af37cc'
    ctx.font = '11px monospace'
    ctx.textAlign = 'center'
    ctx.fillText(label, cx, cy + dr + 18)
  }

  private _drawBar(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, pct: number, color: string): void {
    const bx = x - w / 2
    ctx.fillStyle = '#0a0a0a88'
    ctx.fillRect(bx - 1, y - 1, w + 2, h + 2)
    ctx.fillStyle = color
    ctx.fillRect(bx, y, w * Math.max(0, pct), h)
  }

  private _parseColor(hex: string): { r: number; g: number; b: number; a: number } {
    const h = hex.replace('#', '')
    const r = parseInt(h.substring(0, 2), 16) / 255
    const g = parseInt(h.substring(2, 4), 16) / 255
    const b = parseInt(h.substring(4, 6), 16) / 255
    const a = h.length >= 8 ? parseInt(h.substring(6, 8), 16) / 255 : 1
    return { r: isNaN(r) ? 1 : r, g: isNaN(g) ? 1 : g, b: isNaN(b) ? 1 : b, a: isNaN(a) ? 1 : a }
  }
}
