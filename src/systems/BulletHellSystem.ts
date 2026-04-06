import type { System } from '../ecs/types'
import type { World } from '../ecs/World'
import type { TransformComponent } from '../components/Transform'
import type { ProjectileComponent } from '../components/Projectile'
import { createTransform } from '../components/Transform'
import { createRender } from '../components/Render'
import { createProjectile } from '../components/Projectile'
import { createCircleCollider, LAYER_PROJECTILE, LAYER_ENEMY } from '../components/Collider'
import { createTag } from '../components/Tag'
import type { RenderComponent } from '../components/Render'
import type { InputState } from './InputSystem'

/**
 * BulletHellSystem —— 符箓弹幕的发射与飞行
 *
 * 左键点击：发射直线符箓（朝鼠标方向）
 * Q键：扇形三连发
 *
 * 每帧：
 *   1. 检测发射输入，在玩家位置生成弹幕实体
 *   2. 更新所有弹幕位置（直线飞行）
 *   3. 超出边界或 lifetime 到期则销毁
 */
export class BulletHellSystem implements System {
  readonly name = 'BulletHellSystem'

  private canvasW = 900
  private canvasH = 600

  /** 连射冷却（秒） */
  private fireCooldown = 0
  private readonly FIRE_CD = 0.18

  setBounds(w: number, h: number): void {
    this.canvasW = w
    this.canvasH = h
  }

  update(world: World, dt: number): void {
    const input = world.globals.input as InputState | undefined

    // ── 冷却计时 ──
    if (this.fireCooldown > 0) this.fireCooldown -= dt

    // ── 发射判定 ──
    if (input && this.fireCooldown <= 0) {
      // 找到玩家实体
      const players = world.query(['Transform', 'Movement'])
      const playerId = players[0]

      if (playerId !== undefined) {
        const ptf = world.getComponent<TransformComponent>(playerId, 'Transform')!

        // 左键：单发直线
        if (input.mouseButtons.has(0)) {
          const dx = input.mouseX - ptf.x
          const dy = input.mouseY - ptf.y
          const len = Math.sqrt(dx * dx + dy * dy)
          if (len > 5) {
            this._spawnProjectile(world, playerId, ptf.x, ptf.y, dx / len, dy / len)
            this.fireCooldown = this.FIRE_CD
          }
        }

        // Q键：扇形三连发
        if (input.justPressed.has('KeyQ')) {
          const baseAngle = Math.atan2(
            input.mouseY - ptf.y,
            input.mouseX - ptf.x,
          )
          const spread = 0.28 // 弧度
          for (let i = -1; i <= 1; i++) {
            const angle = baseAngle + i * spread
            this._spawnProjectile(
              world, playerId, ptf.x, ptf.y,
              Math.cos(angle), Math.sin(angle),
              { color: '#44aaff', damage: 12, speed: 700 },
            )
          }
          this.fireCooldown = this.FIRE_CD * 2
        }
      }
    }

    // ── 弹幕飞行与生命周期 ──
    const projectiles = world.query(['Transform', 'Projectile'])
    for (const entity of projectiles) {
      const tf = world.getComponent<TransformComponent>(entity, 'Transform')!
      const pj = world.getComponent<ProjectileComponent>(entity, 'Projectile')!

      // 位置更新（速度已在 vx/vy 中）
      tf.x += tf.vx * dt
      tf.y += tf.vy * dt
      pj.age += dt

      // 出界或到期销毁
      const oob = tf.x < -20 || tf.x > this.canvasW + 20 ||
                  tf.y < -20 || tf.y > this.canvasH + 20
      if (oob || (pj.lifetime > 0 && pj.age >= pj.lifetime)) {
        world.destroyEntity(entity)
      }
    }
  }

  private _spawnProjectile(
    world: World,
    ownerId: number,
    x: number, y: number,
    dirX: number, dirY: number,
    opts?: { color?: string; damage?: number; speed?: number },
  ): void {
    const speed = opts?.speed ?? 620
    const color = opts?.color ?? '#ffdd44'
    const damage = opts?.damage ?? 20

    const entity = world.createEntity()
    const tf = createTransform(x, y)
    tf.vx = dirX * speed
    tf.vy = dirY * speed
    tf.rotation = Math.atan2(dirY, dirX)

    world
      .addComponent(entity, tf)
      .addComponent(entity, createRender(5, color))
      .addComponent(entity, createProjectile(ownerId, { speed, damage, color }))
      .addComponent(entity, createCircleCollider(5, 0.1, {
        isTrigger: true,
        layer: LAYER_PROJECTILE,
        mask: LAYER_ENEMY,
      }))
      .addComponent(entity, createTag('projectile'))

    // 发光效果
    const render = world.getComponent<RenderComponent>(entity, 'Render')
    if (render) render.glowColor = color
  }
}
