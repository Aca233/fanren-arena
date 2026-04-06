import type { System } from '../ecs/types'
import type { World } from '../ecs/World'
import type { TransformComponent } from '../components/Transform'
import type { RenderComponent } from '../components/Render'
import type { HealthComponent, SpiritualityComponent } from '../components/Stats'
import type { ArtifactInstanceComponent } from '../components/ArtifactInstance'
import type { AuraComponent } from '../components/Aura'
import type { TrailComponent } from '../components/SwordFormation'

/**
 * DebugRenderSystem —— Canvas 调试渲染系统（第三阶段增强）
 * - 实体圆体 + 血条/灵性条
 * - 法宝状态指示（追踪线、缠斗圈、僵直闪烁）
 * - 贝塞尔划线预览
 * - 无敌帧闪白效果
 */
export class DebugRenderSystem implements System {
  readonly name = 'DebugRenderSystem'

  private ctx: CanvasRenderingContext2D | null = null
  private width = 900
  private height = 580
  private swordImg: HTMLImageElement | null = null

  setContext(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    this.ctx = ctx
    this.width = w
    this.height = h
    // 预加载飞剑 SVG
    const img = new Image()
    img.src = new URL('/qingzhu-sword.svg', import.meta.url).href
    img.onload = () => { this.swordImg = img }
  }

  update(world: World, _dt: number): void {
    const ctx = this.ctx
    if (!ctx) return

    ctx.clearRect(0, 0, this.width, this.height)

    // 背景
    ctx.fillStyle = '#0a0a0f'
    ctx.fillRect(0, 0, this.width, this.height)

    // 网格
    ctx.strokeStyle = '#1a1a2e'
    ctx.lineWidth = 1
    for (let x = 0; x < this.width; x += 60) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, this.height); ctx.stroke()
    }
    for (let y = 0; y < this.height; y += 60) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(this.width, y); ctx.stroke()
    }

    // 贝塞尔划线预览
    const preview = world.globals.bezierPreview as { x: number; y: number }[] | null
    if (preview && preview.length >= 2) {
      ctx.beginPath()
      ctx.moveTo(preview[0].x, preview[0].y)
      for (let i = 1; i < preview.length; i++) {
        ctx.lineTo(preview[i].x, preview[i].y)
      }
      ctx.strokeStyle = '#ffaa0088'
      ctx.lineWidth = 2
      ctx.setLineDash([6, 4])
      ctx.stroke()
      ctx.setLineDash([])
    }

    // 领域光环圈（在实体下方绘制）
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
      // 领域标签
      ctx.fillStyle = '#ffffff66'
      ctx.font = '9px monospace'
      ctx.textAlign = 'center'
      ctx.fillText(aura.effect, tf.x, tf.y + aura.radius + 10)
    }

    // ── 环境暗化 ──
    const darken = (world.globals.domainDarken ?? 0) as number
    if (darken > 0) {
      ctx.fillStyle = `rgba(0, 0, 0, ${darken})`
      ctx.fillRect(0, 0, this.width, this.height)
    }

    // ── 顿帧（HitStop）—— 不跳帧，只暂停实体运动由系统处理 ──
    const hitStop = (world.globals.hitStop ?? 0) as number
    if (hitStop > 0) {
      world.globals.hitStop = hitStop - _dt
    }

    // ── 大庚剑阵结界 ──
    const domainCircle = world.globals.domainCircle as {
      x: number; y: number; radius: number; timer: number; phase: string
      swordSilks: { x1: number; y1: number; x2: number; y2: number; alpha: number }[]
      deployDuration: number; activeDuration: number
      coreHealth: number; coreHealthMax: number
    } | null
    if (domainCircle) {
      const { x: cx, y: cy, radius: dr, timer, phase, swordSilks } = domainCircle
      const pulse = 0.7 + Math.sin(timer * 3) * 0.3
      const deployPct = phase === 'deploying' ? Math.min(1, timer / domainCircle.deployDuration) : 1

      // ── 多层结界环 ──
      // 外圈主界（粗发光）
      ctx.beginPath()
      ctx.arc(cx, cy, dr * deployPct, 0, Math.PI * 2)
      const grad = ctx.createRadialGradient(cx, cy, dr * 0.7 * deployPct, cx, cy, dr * deployPct)
      grad.addColorStop(0, 'rgba(30, 60, 20, 0)')
      grad.addColorStop(0.7, `rgba(60, 120, 40, ${0.06 * pulse})`)
      grad.addColorStop(1, `rgba(180, 160, 60, ${0.12 * pulse})`)
      ctx.fillStyle = grad
      ctx.fill()

      // 外圈线
      ctx.strokeStyle = `rgba(180, 160, 60, ${0.6 * pulse * deployPct})`
      ctx.lineWidth = 2.5
      ctx.stroke()

      // 中圈
      ctx.beginPath()
      ctx.arc(cx, cy, dr * 0.72 * deployPct, 0, Math.PI * 2)
      ctx.strokeStyle = `rgba(140, 200, 80, ${0.25 * pulse * deployPct})`
      ctx.lineWidth = 1
      ctx.stroke()

      // 内圈
      ctx.beginPath()
      ctx.arc(cx, cy, dr * 0.4 * deployPct, 0, Math.PI * 2)
      ctx.strokeStyle = `rgba(200, 180, 60, ${0.2 * pulse * deployPct})`
      ctx.lineWidth = 1.5
      ctx.stroke()

      // ── 八卦阵纹 ──
      if (deployPct > 0.3) {
        const a8 = deployPct * (phase === 'active' ? 1 : 0.6)

        // 八条辐射线（双色交替）
        for (let i = 0; i < 8; i++) {
          const angle = (i / 8) * Math.PI * 2 + timer * 0.4
          const inner = dr * 0.08
          const outer = dr * 0.88 * deployPct
          ctx.beginPath()
          ctx.moveTo(cx + Math.cos(angle) * inner, cy + Math.sin(angle) * inner)
          ctx.lineTo(cx + Math.cos(angle) * outer, cy + Math.sin(angle) * outer)
          ctx.strokeStyle = i % 2 === 0
            ? `rgba(200, 180, 60, ${0.35 * a8})`
            : `rgba(100, 180, 60, ${0.2 * a8})`
          ctx.lineWidth = i % 2 === 0 ? 1.5 : 1
          ctx.stroke()
        }

        // 旋转弧段（太极意象）
        for (let i = 0; i < 3; i++) {
          const r = dr * (0.3 + i * 0.18) * deployPct
          const startA = timer * (1.2 - i * 0.3) + i * 2.1
          ctx.beginPath()
          ctx.arc(cx, cy, r, startA, startA + Math.PI * 0.8)
          ctx.strokeStyle = `rgba(180, 220, 80, ${0.25 * a8 * pulse})`
          ctx.lineWidth = 1.5
          ctx.stroke()
        }

        // 阵眼核心光点
        const coreGlow = ctx.createRadialGradient(cx, cy, 0, cx, cy, 18)
        coreGlow.addColorStop(0, `rgba(255, 240, 160, ${0.5 * pulse * a8})`)
        coreGlow.addColorStop(1, 'rgba(255, 240, 160, 0)')
        ctx.beginPath()
        ctx.arc(cx, cy, 18, 0, Math.PI * 2)
        ctx.fillStyle = coreGlow
        ctx.fill()
      }

      // ── 剑丝（翠绿+金色渐变闪线）──
      for (const silk of swordSilks) {
        // 外层：宽的翠绿光晕
        ctx.beginPath()
        ctx.moveTo(silk.x1, silk.y1)
        ctx.lineTo(silk.x2, silk.y2)
        ctx.strokeStyle = `rgba(140, 220, 80, ${silk.alpha * 0.25})`
        ctx.lineWidth = 5
        ctx.stroke()
        // 中层：金色
        ctx.strokeStyle = `rgba(220, 200, 80, ${silk.alpha * 0.5})`
        ctx.lineWidth = 2
        ctx.stroke()
        // 内层：白芯
        ctx.strokeStyle = `rgba(255, 255, 240, ${silk.alpha * 0.9})`
        ctx.lineWidth = 0.8
        ctx.stroke()
      }

      // ── 阵眼血条 ──
      if (phase === 'active') {
        const barW = 70, barH = 4
        const bx = cx - barW / 2, by = cy + dr + 6
        const pct = domainCircle.coreHealth / domainCircle.coreHealthMax
        ctx.fillStyle = '#0a0a0a88'
        ctx.fillRect(bx - 1, by - 1, barW + 2, barH + 2)
        const barGrad = ctx.createLinearGradient(bx, by, bx + barW * pct, by)
        barGrad.addColorStop(0, pct > 0.5 ? '#88cc44' : '#cc8822')
        barGrad.addColorStop(1, pct > 0.5 ? '#d4af37' : '#cc3333')
        ctx.fillStyle = barGrad
        ctx.fillRect(bx, by, barW * pct, barH)
      }

      // ── 状态文字 ──
      const label = phase === 'deploying' ? `布阵中 ${(domainCircle.deployDuration - timer).toFixed(1)}s`
        : phase === 'active' ? `大庚剑阵 ${(domainCircle.activeDuration - timer).toFixed(1)}s`
        : '收阵…'
      ctx.fillStyle = '#d4af37cc'
      ctx.font = '11px monospace'
      ctx.textAlign = 'center'
      ctx.fillText(label, cx, cy + dr + 16)
    }

    // 飞剑拖尾
    const trails = world.getAllWithComponent<TrailComponent>('Trail')
    for (const [, trail] of trails) {
      if (trail.positions.length < 2) continue
      ctx.beginPath()
      ctx.moveTo(trail.positions[0].x, trail.positions[0].y)
      for (let i = 1; i < trail.positions.length; i++) {
        ctx.lineTo(trail.positions[i].x, trail.positions[i].y)
      }
      ctx.strokeStyle = trail.color
      ctx.lineWidth = trail.width
      ctx.stroke()
    }

    const transforms = world.getAllWithComponent<TransformComponent>('Transform')
    const renders = world.getAllWithComponent<RenderComponent>('Render')

    for (const [entity, render] of renders) {
      if (!render.visible) continue
      const tf = transforms.get(entity)
      if (!tf) continue

      const { radius, color, glowColor, label } = render
      const inst = world.getComponent<ArtifactInstanceComponent>(entity, 'ArtifactInstance')
      const isInvincible = world.hasComponent(entity, 'Invincible')

      // 法宝追踪线
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

      // 僵直闪烁
      if (inst && inst.state === 'stunned') {
        ctx.globalAlpha = 0.4 + Math.sin(Date.now() * 0.02) * 0.3
      }

      // 无敌闪白
      if (isInvincible) {
        ctx.globalAlpha = 0.5 + Math.sin(Date.now() * 0.03) * 0.3
      }

      // 发光
      if (glowColor) {
        ctx.shadowBlur = radius * 1.5
        ctx.shadowColor = glowColor
      }

      // 主体：飞剑（有Trail组件）画SVG剑形，其他画圆
      const hasTrail = world.hasComponent(entity, 'Trail')
      if (hasTrail && radius <= 5) {
        // ── 绘制飞剑（SVG 或 fallback）──
        ctx.save()
        ctx.translate(tf.x, tf.y)
        // SVG 剑尖朝左上（-135°），补偿到 tf.rotation 方向
        ctx.rotate(tf.rotation + Math.PI * 0.75)
        if (this.swordImg) {
          const sw = 36, sh = 36
          ctx.drawImage(this.swordImg, -sw / 2, -sh / 2, sw, sh)
        } else {
          // fallback 菱形
          const len = 14, w = 3
          ctx.beginPath()
          ctx.moveTo(0, -len)
          ctx.lineTo(-w, len * 0.3)
          ctx.lineTo(0, len * 0.5)
          ctx.lineTo(w, len * 0.3)
          ctx.closePath()
          ctx.fillStyle = isInvincible ? '#ffffff' : color
          ctx.fill()
        }
        ctx.restore()
      } else {
        // ── 普通圆体 ──
        ctx.beginPath()
        ctx.arc(tf.x, tf.y, radius, 0, Math.PI * 2)
        ctx.fillStyle = isInvincible ? '#ffffff' : color
        ctx.fill()
        ctx.strokeStyle = '#ffffff33'
        ctx.lineWidth = 1.5
        ctx.stroke()
      }

      ctx.shadowBlur = 0
      ctx.globalAlpha = 1

      // 朝向线
      ctx.beginPath()
      ctx.moveTo(tf.x, tf.y)
      ctx.lineTo(
        tf.x + Math.cos(tf.rotation) * radius * 1.4,
        tf.y + Math.sin(tf.rotation) * radius * 1.4,
      )
      ctx.strokeStyle = '#ffffff66'
      ctx.lineWidth = 1.5
      ctx.stroke()

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
          ctx.fillText(stateLabel, tf.x, tf.y - radius - 14)
        }
      }

      // 标签
      if (label) {
        ctx.fillStyle = '#e8e0d0cc'
        ctx.font = '11px monospace'
        ctx.textAlign = 'center'
        ctx.fillText(label, tf.x, tf.y - radius - 5)
      }

      // 血条（只对非飞剑实体显示）
      const hp = world.getComponent<HealthComponent>(entity, 'Health')
      if (hp && !hasTrail) {
        this._drawBar(ctx, tf.x, tf.y + radius + 4, radius * 2.4, 4,
          hp.current / hp.max,
          hp.current / hp.max > 0.5 ? '#44cc44' : hp.current / hp.max > 0.25 ? '#ccaa22' : '#cc3333')
      }

      // 灵性条（只对非飞剑法宝显示）
      const sp = world.getComponent<SpiritualityComponent>(entity, 'Spirituality')
      if (sp && !hasTrail) {
        this._drawBar(ctx, tf.x, tf.y + radius + 10, radius * 2.4, 3,
          sp.current / sp.max, '#4488cc')
      }
    }
  }

  private _drawBar(
    ctx: CanvasRenderingContext2D,
    x: number, y: number, w: number, h: number,
    pct: number, color: string,
  ): void {
    const bx = x - w / 2
    ctx.fillStyle = '#11111188'
    ctx.fillRect(bx, y, w, h)
    ctx.fillStyle = color
    ctx.fillRect(bx, y, w * Math.max(0, pct), h)
  }
}
