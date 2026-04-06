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

  setContext(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    this.ctx = ctx
    this.width = w
    this.height = h
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

    // 大庚剑阵结界
    const domainCircle = world.globals.domainCircle as { x: number; y: number; radius: number; timer: number; maxDuration: number } | null
    if (domainCircle) {
      const pulse = 0.6 + Math.sin(domainCircle.timer * 4) * 0.15
      ctx.beginPath()
      ctx.arc(domainCircle.x, domainCircle.y, domainCircle.radius, 0, Math.PI * 2)
      ctx.fillStyle = `rgba(212, 175, 55, ${0.06 * pulse})`
      ctx.fill()
      ctx.strokeStyle = `rgba(212, 175, 55, ${0.4 * pulse})`
      ctx.lineWidth = 2
      ctx.setLineDash([8, 4])
      ctx.stroke()
      ctx.setLineDash([])
      // 阵法纹路（旋转的内圈）
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + domainCircle.timer * 0.8
        const inner = domainCircle.radius * 0.4
        const outer = domainCircle.radius * 0.85
        ctx.beginPath()
        ctx.moveTo(domainCircle.x + Math.cos(a) * inner, domainCircle.y + Math.sin(a) * inner)
        ctx.lineTo(domainCircle.x + Math.cos(a) * outer, domainCircle.y + Math.sin(a) * outer)
        ctx.strokeStyle = '#d4af3733'
        ctx.lineWidth = 1
        ctx.stroke()
      }
      // 剩余时间指示
      ctx.fillStyle = '#d4af37aa'
      ctx.font = '10px monospace'
      ctx.textAlign = 'center'
      ctx.fillText(`大庚剑阵 ${(domainCircle.maxDuration - domainCircle.timer).toFixed(1)}s`, domainCircle.x, domainCircle.y + domainCircle.radius + 14)
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

      // 主体：飞剑（有Trail组件）画剑形，其他画圆
      const hasTrail = world.hasComponent(entity, 'Trail')
      if (hasTrail && radius <= 5) {
        // ── 绘制剑形 ──
        const len = 12
        const w = 2.5
        ctx.save()
        ctx.translate(tf.x, tf.y)
        ctx.rotate(tf.rotation)
        // 剑身
        ctx.beginPath()
        ctx.moveTo(len, 0)           // 剑尖
        ctx.lineTo(-len * 0.3, -w)   // 左刃
        ctx.lineTo(-len * 0.5, 0)    // 剑柄凹口
        ctx.lineTo(-len * 0.3, w)    // 右刃
        ctx.closePath()
        ctx.fillStyle = isInvincible ? '#ffffff' : color
        ctx.fill()
        ctx.strokeStyle = '#ffffffaa'
        ctx.lineWidth = 0.5
        ctx.stroke()
        // 剑芒（尖端亮光）
        ctx.beginPath()
        ctx.moveTo(len, 0)
        ctx.lineTo(len + 4, 0)
        ctx.strokeStyle = glowColor ?? '#d4af37'
        ctx.lineWidth = 1.5
        ctx.stroke()
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

      // 血条
      const hp = world.getComponent<HealthComponent>(entity, 'Health')
      if (hp) {
        this._drawBar(ctx, tf.x, tf.y + radius + 4, radius * 2.4, 4,
          hp.current / hp.max,
          hp.current / hp.max > 0.5 ? '#44cc44' : hp.current / hp.max > 0.25 ? '#ccaa22' : '#cc3333')
      }

      // 灵性条（法宝）
      const sp = world.getComponent<SpiritualityComponent>(entity, 'Spirituality')
      if (sp) {
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
