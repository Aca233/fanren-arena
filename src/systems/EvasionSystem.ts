import type { System } from '../ecs/types'
import type { World } from '../ecs/World'
import type { TransformComponent } from '../components/Transform'
import type { EvasionComponent } from '../components/Evasion'
import type { MovementComponent } from '../components/Movement'
import type { RenderComponent } from '../components/Render'
import type { InvincibleComponent } from '../components/Evasion'
import { createInvincible } from '../components/Evasion'
import type { InputState } from './InputSystem'

/**
 * EvasionSystem —— 遁术与无敌帧
 *
 * 状态机：
 *   ready → [右键/Shift触发] → windup（挂载 Invincible）
 *         → dashing（高速位移）
 *         → recovery（短暂硬直）
 *         → ready
 *
 * i-frame 覆盖 windup + 前半段 dash
 */
export class EvasionSystem implements System {
  readonly name = 'EvasionSystem'

  private canvasW = 900
  private canvasH = 600

  setBounds(w: number, h: number): void {
    this.canvasW = w
    this.canvasH = h
  }

  update(world: World, dt: number): void {
    const input = world.globals.input as InputState | undefined
    if (!input) return

    const entities = world.query(['Transform', 'Evasion'])

    for (const entity of entities) {
      const tf = world.getComponent<TransformComponent>(entity, 'Transform')!
      const ev = world.getComponent<EvasionComponent>(entity, 'Evasion')!

      // ── 冷却计时 ──
      if (ev.cooldownRemaining > 0) {
        ev.cooldownRemaining = Math.max(0, ev.cooldownRemaining - dt)
      }

      // ── 触发判定（ready 状态 + 右键 + 冷却归零）──
      if (
        ev.state === 'ready' &&
        ev.cooldownRemaining <= 0 &&
        input.mouseJustPressed.has(2)
      ) {
        // 冲刺方向：鼠标到玩家的方向，若相同则用当前朝向
        const mx = input.mouseX
        const my = input.mouseY
        const dx = tf.x - mx
        const dy = tf.y - my
        const len = Math.sqrt(dx * dx + dy * dy)
        if (len > 10) {
          ev.dirX = dx / len
          ev.dirY = dy / len
        } else {
          ev.dirX = Math.cos(tf.rotation)
          ev.dirY = Math.sin(tf.rotation)
        }

        ev.state = 'windup'
        ev.stateTimer = 0

        // 挂载无敌帧（windup + dashDuration * 0.6）
        const iFrameDuration = ev.windupDuration + ev.dashDuration * 0.6
        world.addComponent(entity, createInvincible(iFrameDuration))
      }

      // ── 状态机 ──
      ev.stateTimer += dt

      switch (ev.state) {
        case 'windup': {
          // 前摇：轻微减速（蓄势感）
          const mv = world.getComponent<MovementComponent>(entity, 'Movement')
          if (mv) {
            tf.vx *= 0.5
            tf.vy *= 0.5
          }
          if (ev.stateTimer >= ev.windupDuration) {
            ev.state = 'dashing'
            ev.stateTimer = 0
          }
          break
        }

        case 'dashing': {
          // 高速冲刺
          tf.vx = ev.dirX * ev.dashSpeed
          tf.vy = ev.dirY * ev.dashSpeed
          tf.x += tf.vx * dt
          tf.y += tf.vy * dt

          const r = world.getComponent<RenderComponent>(entity, 'Render')?.radius ?? 16
          tf.x = Math.max(r, Math.min(this.canvasW - r, tf.x))
          tf.y = Math.max(r, Math.min(this.canvasH - r, tf.y))

          if (ev.stateTimer >= ev.dashDuration) {
            ev.state = 'recovery'
            ev.stateTimer = 0
            tf.vx = 0; tf.vy = 0
          }
          break
        }

        case 'recovery': {
          const recoveryDuration = 0.1
          if (ev.stateTimer >= recoveryDuration) {
            ev.state = 'ready'
            ev.stateTimer = 0
            ev.cooldownRemaining = ev.cooldown
          }
          break
        }
      }

      // ── 无敌帧计时 ──
      const inv = world.getComponent<InvincibleComponent>(entity, 'Invincible')
      if (inv) {
        inv.remaining -= dt
        if (inv.remaining <= 0) {
          world.removeComponent(entity, 'Invincible')
        }
      }
    }
  }
}
