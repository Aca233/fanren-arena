import type { System } from '../ecs/types'
import type { World } from '../ecs/World'
import type { TransformComponent } from '../components/Transform'
import type { ArtifactInstanceComponent } from '../components/ArtifactInstance'
import type { DivineSenseComponent } from '../components/DivineSense'
import type { TagComponent } from '../components/Tag'
import type { InputState } from './InputSystem'
import { normalize } from '../physics/collision'

/**
 * ArtifactControlSystem —— 法宝 RTS 微操
 *
 * - 右键点击敌人附近：选中的法宝切换 chasing 状态
 * - Shift + 左键划线：录制贝塞尔路径，法宝沿曲线飞行绕后
 * - 法宝到达目标后自动进入缠斗（围绕目标高速旋转）
 */
export class ArtifactControlSystem implements System {
  readonly name = 'ArtifactControlSystem'

  /** 贝塞尔录制状态 */
  private isDrawing = false
  private drawPoints: { x: number; y: number }[] = []

  private canvasW = 900
  private canvasH = 580

  setBounds(w: number, h: number): void {
    this.canvasW = w
    this.canvasH = h
  }

  update(world: World, dt: number): void {
    const input = world.globals.input as InputState | undefined
    if (!input) return

    // ── 找到玩家的神识组件 ──
    const players = world.query(['DivineSense', 'Transform'])
    if (players.length === 0) return
    const playerId = players[0]
    const ds = world.getComponent<DivineSenseComponent>(playerId, 'DivineSense')!
    if (ds.overloaded) return // 过载中不可操控

    // ── 右键 → 指派追踪 ──
    if (input.mouseJustPressed.has(2) && !input.keys.has('ShiftLeft')) {
      const targetId = this._findNearestEnemy(world, input.mouseX, input.mouseY, 60)
      if (targetId !== -1) {
        // 指派所有 orbiting 状态的法宝追踪此目标
        for (const aid of ds.activeArtifacts) {
          if (!world.isAlive(aid)) continue
          const inst = world.getComponent<ArtifactInstanceComponent>(aid, 'ArtifactInstance')
          if (inst && inst.state === 'orbiting') {
            inst.state = 'chasing'
            inst.targetId = targetId
            inst.stateTimer = 0
          }
        }
      }
    }

    // ── Shift + 左键划线 → 录制贝塞尔路径 ──
    if (input.keys.has('ShiftLeft') && input.mouseButtons.has(0)) {
      if (!this.isDrawing) {
        this.isDrawing = true
        this.drawPoints = [{ x: input.mouseX, y: input.mouseY }]
      } else {
        const last = this.drawPoints[this.drawPoints.length - 1]
        const dx = input.mouseX - last.x
        const dy = input.mouseY - last.y
        if (dx * dx + dy * dy > 400) { // 每 20px 采样
          this.drawPoints.push({ x: input.mouseX, y: input.mouseY })
        }
      }
    } else if (this.isDrawing) {
      // 松手 → 提交贝塞尔路径
      this.isDrawing = false
      if (this.drawPoints.length >= 2) {
        const points = this._simplifyToBezier(this.drawPoints)
        // 指派第一个 orbiting 法宝沿路径飞行
        for (const aid of ds.activeArtifacts) {
          if (!world.isAlive(aid)) continue
          const inst = world.getComponent<ArtifactInstanceComponent>(aid, 'ArtifactInstance')
          if (inst && inst.state === 'orbiting') {
            inst.state = 'bezier'
            inst.bezierPoints = points
            inst.bezierT = 0
            inst.stateTimer = 0
            break // 只指派一把
          }
        }
      }
      this.drawPoints = []
    }

    // ── 绘制划线预览（写入 globals 给 render 读取）──
    world.globals.bezierPreview = this.isDrawing ? this.drawPoints : null

    // ── 更新所有法宝行为 ──
    const artifacts = world.query(['Transform', 'ArtifactInstance'])
    for (const entity of artifacts) {
      const tf = world.getComponent<TransformComponent>(entity, 'Transform')!
      const inst = world.getComponent<ArtifactInstanceComponent>(entity, 'ArtifactInstance')!

      inst.stateTimer += dt

      switch (inst.state) {
        case 'chasing':
          this._updateChasing(world, entity, tf, inst, dt)
          break
        case 'bezier':
          this._updateBezier(world, entity, tf, inst, dt)
          break
        case 'stunned':
          this._updateStunned(world, entity, tf, inst, dt)
          break
        case 'returning': {
          // 返回主人身边
          const ownerTf = world.getComponent<TransformComponent>(inst.ownerId, 'Transform')
          if (ownerTf) {
            const dir = normalize(ownerTf.x - tf.x, ownerTf.y - tf.y)
            tf.vx = dir.x * 400
            tf.vy = dir.y * 400
            tf.x += tf.vx * dt
            tf.y += tf.vy * dt
            const dx = ownerTf.x - tf.x
            const dy = ownerTf.y - tf.y
            if (dx * dx + dy * dy < 40 * 40) {
              inst.state = 'orbiting'
              tf.vx = 0; tf.vy = 0
            }
          }
          break
        }
        // orbiting 由 DivineSenseSystem 处理
      }
    }
  }

  private _updateChasing(
    world: World, _entity: number,
    tf: TransformComponent, inst: ArtifactInstanceComponent, dt: number,
  ): void {
    if (!world.isAlive(inst.targetId)) {
      inst.state = 'returning'
      return
    }
    const targetTf = world.getComponent<TransformComponent>(inst.targetId, 'Transform')
    if (!targetTf) { inst.state = 'returning'; return }

    const dx = targetTf.x - tf.x
    const dy = targetTf.y - tf.y
    const distSq = dx * dx + dy * dy

    if (distSq < 35 * 35) {
      // 缠斗模式：围绕目标旋转
      inst.orbitAngle += 6.0 * dt
      tf.x = targetTf.x + Math.cos(inst.orbitAngle) * 30
      tf.y = targetTf.y + Math.sin(inst.orbitAngle) * 30
      tf.rotation = inst.orbitAngle + Math.PI / 2
    } else {
      // 追踪飞行
      const dist = Math.sqrt(distSq)
      const speed = 380
      tf.vx = (dx / dist) * speed
      tf.vy = (dy / dist) * speed
      tf.x += tf.vx * dt
      tf.y += tf.vy * dt
      tf.rotation = Math.atan2(dy, dx)
    }
  }

  private _updateBezier(
    _world: World, _entity: number,
    tf: TransformComponent, inst: ArtifactInstanceComponent, dt: number,
  ): void {
    inst.bezierT += inst.bezierSpeed * dt
    if (inst.bezierT >= 1) {
      inst.state = 'returning'
      inst.bezierT = 1
      return
    }

    const pts = inst.bezierPoints
    if (pts.length < 2) { inst.state = 'returning'; return }

    // De Casteljau 算法求贝塞尔曲线上的点
    const pos = this._deCasteljau(pts, inst.bezierT)
    const posNext = this._deCasteljau(pts, Math.min(1, inst.bezierT + 0.02))

    tf.x = pos.x
    tf.y = pos.y
    tf.rotation = Math.atan2(posNext.y - pos.y, posNext.x - pos.x)
    tf.vx = (posNext.x - pos.x) / dt
    tf.vy = (posNext.y - pos.y) / dt

    // 边界钳位
    tf.x = Math.max(5, Math.min(this.canvasW - 5, tf.x))
    tf.y = Math.max(5, Math.min(this.canvasH - 5, tf.y))
  }

  private _updateStunned(
    _world: World, _entity: number, // eslint-disable-line @typescript-eslint/no-unused-vars
    tf: TransformComponent, inst: ArtifactInstanceComponent, dt: number,
  ): void {
    inst.stunRemaining -= dt
    // 失控：缓慢漂移
    tf.vx *= 0.95
    tf.vy *= 0.95
    tf.x += tf.vx * dt
    tf.y += tf.vy * dt
    tf.x = Math.max(5, Math.min(this.canvasW - 5, tf.x))
    tf.y = Math.max(5, Math.min(this.canvasH - 5, tf.y))

    if (inst.stunRemaining <= 0) {
      inst.state = 'returning'
      inst.stunRemaining = 0
    }
  }

  /** De Casteljau 算法：支持任意阶贝塞尔 */
  private _deCasteljau(
    points: { x: number; y: number }[], t: number,
  ): { x: number; y: number } {
    if (points.length === 1) return points[0]
    const next: { x: number; y: number }[] = []
    for (let i = 0; i < points.length - 1; i++) {
      next.push({
        x: points[i].x * (1 - t) + points[i + 1].x * t,
        y: points[i].y * (1 - t) + points[i + 1].y * t,
      })
    }
    return this._deCasteljau(next, t)
  }

  /** 简化采样点为 4 点贝塞尔控制点 */
  private _simplifyToBezier(
    points: { x: number; y: number }[],
  ): { x: number; y: number }[] {
    if (points.length <= 4) return points
    const n = points.length - 1
    return [
      points[0],
      points[Math.floor(n * 0.33)],
      points[Math.floor(n * 0.66)],
      points[n],
    ]
  }

  /** 找鼠标附近最近的敌人 */
  private _findNearestEnemy(
    world: World, mx: number, my: number, maxDist: number,
  ): number {
    const enemies = world.query(['Transform', 'Tag'])
    let best = -1
    let bestDistSq = maxDist * maxDist

    for (const eid of enemies) {
      const tag = world.getComponent<TagComponent>(eid, 'Tag')!
      if (tag.role !== 'dummy' && tag.role !== 'enemy') continue
      const etf = world.getComponent<TransformComponent>(eid, 'Transform')!
      const dx = etf.x - mx
      const dy = etf.y - my
      const dsq = dx * dx + dy * dy
      if (dsq < bestDistSq) {
        bestDistSq = dsq
        best = eid
      }
    }
    return best
  }
}
