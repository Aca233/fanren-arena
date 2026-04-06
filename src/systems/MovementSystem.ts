import type { System } from '../ecs/types'
import type { World } from '../ecs/World'
import type { TransformComponent } from '../components/Transform'
import type { MovementComponent } from '../components/Movement'
import type { RenderComponent } from '../components/Render'
import type { InputState } from './InputSystem'

/**
 * MovementSystem —— WASD 八向移动 + 提气加速 + 卸力惯性
 *
 * 每帧流程：
 *   1. 读取键盘输入，计算意图方向向量
 *   2. 判断是否提气（Shift），设置 movement.isBoosting
 *   3. 将意图速度叠加到 transform.vx/vy
 *   4. 若无输入，对速度施加卸力（惯性衰减）
 *   5. 将速度积分到位置（边界钳位）
 */
export class MovementSystem implements System {
  readonly name = 'MovementSystem'

  private canvasW = 900
  private canvasH = 600

  setBounds(w: number, h: number): void {
    this.canvasW = w
    this.canvasH = h
  }

  update(world: World, dt: number): void {
    const input = world.globals.input as InputState | undefined
    if (!input) return

    const entities = world.query(['Transform', 'Movement'])

    for (const entity of entities) {
      const tf = world.getComponent<TransformComponent>(entity, 'Transform')!
      const mv = world.getComponent<MovementComponent>(entity, 'Movement')!

      // ── 1. 读取意图方向 ──
      let ix = 0, iy = 0
      if (input.keys.has('KeyW') || input.keys.has('ArrowUp'))    iy -= 1
      if (input.keys.has('KeyS') || input.keys.has('ArrowDown'))  iy += 1
      if (input.keys.has('KeyA') || input.keys.has('ArrowLeft'))  ix -= 1
      if (input.keys.has('KeyD') || input.keys.has('ArrowRight')) ix += 1

      const hasInput = ix !== 0 || iy !== 0

      // ── 2. 规范化八向为单位向量 ──
      if (hasInput) {
        const len = Math.sqrt(ix * ix + iy * iy)
        ix /= len
        iy /= len
      }

      // ── 3. 提气判定 ──
      mv.isBoosting = input.keys.has('ShiftLeft') || input.keys.has('ShiftRight')
      mv.speed = mv.isBoosting ? mv.baseSpeed * mv.boostMultiplier : mv.baseSpeed

      // ── 4. 应用速度 ──
      if (hasInput) {
        tf.vx = ix * mv.speed
        tf.vy = iy * mv.speed
        // 朝向跟随移动方向
        tf.rotation = Math.atan2(iy, ix)
      } else {
        // 卸力：惯性衰减
        tf.vx *= mv.friction
        tf.vy *= mv.friction
        // 速度极小时归零，防止永久漂移
        if (Math.abs(tf.vx) < 0.5) tf.vx = 0
        if (Math.abs(tf.vy) < 0.5) tf.vy = 0
      }

      // ── 5. 积分位置 + 边界钳位 ──
      tf.x += tf.vx * dt
      tf.y += tf.vy * dt

      // 获取碰撞半径（若有 Render 组件则用其 radius）
      const render = world.getComponent<RenderComponent>(entity, 'Render')
      const r = render?.radius ?? 16

      tf.x = Math.max(r, Math.min(this.canvasW - r, tf.x))
      tf.y = Math.max(r, Math.min(this.canvasH - r, tf.y))
    }
  }
}
