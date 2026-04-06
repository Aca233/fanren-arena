import type { System } from '../ecs/types'
import type { World } from '../ecs/World'
import type { TransformComponent } from '../components/Transform'
import type { BoidComponent } from '../components/Boid'
import { distSq } from '../physics/collision'

/**
 * BoidsSystem —— 鸟群算法：分离 + 对齐 + 凝聚 + 目标追踪
 *
 * 实装效果：
 *   噬金虫云  → 高凝聚+高追踪，包裹吞噬目标
 *   青竹蜂云剑 → 均衡三权重，自动拦截来袭法宝
 */
export class BoidsSystem implements System {
  readonly name = 'BoidsSystem'

  private canvasW = 900
  private canvasH = 580

  setBounds(w: number, h: number): void { this.canvasW = w; this.canvasH = h }

  update(world: World, dt: number): void {
    const boids = world.query(['Transform', 'Boid'])
    if (boids.length === 0) return

    // 按群组分桶
    const groups = new Map<string, number[]>()
    for (const eid of boids) {
      const b = world.getComponent<BoidComponent>(eid, 'Boid')!
      const arr = groups.get(b.groupId) ?? []
      arr.push(eid)
      groups.set(b.groupId, arr)
    }

    for (const [_gid, members] of groups) {
      this._updateGroup(world, members, dt)
    }
  }

  private _updateGroup(world: World, members: number[], dt: number): void {
    // 预读所有位置和速度
    const data = members.map(eid => ({
      eid,
      tf: world.getComponent<TransformComponent>(eid, 'Transform')!,
      boid: world.getComponent<BoidComponent>(eid, 'Boid')!,
    }))

    for (const { eid, tf, boid } of data) {
      let sepX = 0, sepY = 0, sepCount = 0
      let aliVx = 0, aliVy = 0, aliCount = 0
      let cohX = 0, cohY = 0, cohCount = 0

      for (const other of data) {
        if (other.eid === eid) continue
        const dsq = distSq(tf.x, tf.y, other.tf.x, other.tf.y)

        // 分离
        if (dsq < boid.separationRadius * boid.separationRadius && dsq > 0.01) {
          const d = Math.sqrt(dsq)
          sepX += (tf.x - other.tf.x) / d / d
          sepY += (tf.y - other.tf.y) / d / d
          sepCount++
        }

        // 对齐 & 凝聚
        if (dsq < boid.perceptionRadius * boid.perceptionRadius) {
          aliVx += other.tf.vx
          aliVy += other.tf.vy
          aliCount++
          cohX += other.tf.x
          cohY += other.tf.y
          cohCount++
        }
      }

      let fx = 0, fy = 0

      // 分离力
      if (sepCount > 0) {
        fx += (sepX / sepCount) * boid.separationWeight * boid.maxForce
        fy += (sepY / sepCount) * boid.separationWeight * boid.maxForce
      }

      // 对齐力
      if (aliCount > 0) {
        const avgVx = aliVx / aliCount
        const avgVy = aliVy / aliCount
        fx += (avgVx - tf.vx) * boid.alignmentWeight * 0.1
        fy += (avgVy - tf.vy) * boid.alignmentWeight * 0.1
      }

      // 凝聚力
      if (cohCount > 0) {
        const centerX = cohX / cohCount
        const centerY = cohY / cohCount
        fx += (centerX - tf.x) * boid.cohesionWeight * 0.5
        fy += (centerY - tf.y) * boid.cohesionWeight * 0.5
      }

      // 目标追踪
      if (boid.targetId !== -1 && world.isAlive(boid.targetId)) {
        const targetTf = world.getComponent<TransformComponent>(boid.targetId, 'Transform')
        if (targetTf) {
          const dx = targetTf.x - tf.x
          const dy = targetTf.y - tf.y
          const len = Math.sqrt(dx * dx + dy * dy)
          if (len > 5) {
            fx += (dx / len) * boid.seekWeight * boid.maxForce
            fy += (dy / len) * boid.seekWeight * boid.maxForce
          }
        }
      }

      // 限制力
      const fLen = Math.sqrt(fx * fx + fy * fy)
      if (fLen > boid.maxForce) {
        fx = (fx / fLen) * boid.maxForce
        fy = (fy / fLen) * boid.maxForce
      }

      // 应用力
      tf.vx += fx * dt
      tf.vy += fy * dt

      // 限速
      const speed = Math.sqrt(tf.vx * tf.vx + tf.vy * tf.vy)
      if (speed > boid.maxSpeed) {
        tf.vx = (tf.vx / speed) * boid.maxSpeed
        tf.vy = (tf.vy / speed) * boid.maxSpeed
      }

      // 积分位置
      tf.x += tf.vx * dt
      tf.y += tf.vy * dt

      // 朝向
      if (speed > 10) tf.rotation = Math.atan2(tf.vy, tf.vx)

      // 边界弹回
      if (tf.x < 10) { tf.x = 10; tf.vx = Math.abs(tf.vx) * 0.5 }
      if (tf.x > this.canvasW - 10) { tf.x = this.canvasW - 10; tf.vx = -Math.abs(tf.vx) * 0.5 }
      if (tf.y < 10) { tf.y = 10; tf.vy = Math.abs(tf.vy) * 0.5 }
      if (tf.y > this.canvasH - 10) { tf.y = this.canvasH - 10; tf.vy = -Math.abs(tf.vy) * 0.5 }
    }
  }
}
