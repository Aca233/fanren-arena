import type { System } from '../ecs/types'
import type { World } from '../ecs/World'
import type { TransformComponent } from '../components/Transform'
import type { AIControllerComponent } from '../components/AIController'
import type { HealthComponent } from '../components/Stats'
import type { TagComponent } from '../components/Tag'
import { distSq, normalize } from '../physics/collision'

/**
 * AISystem —— 灵兽 AI 行为树
 *
 * 状态机：idle → patrol → alert → attack → flee
 * 特殊行为：
 *   ghost_hunter（啼魂兽）：检测鬼道法宝 → berserk 狂暴
 *   flanker（六翼霜蚣）：attack 时自动绕背
 */
export class AISystem implements System {
  readonly name = 'AISystem'

  private canvasW = 900
  private canvasH = 580

  setBounds(w: number, h: number): void { this.canvasW = w; this.canvasH = h }

  update(world: World, dt: number): void {
    const entities = world.query(['Transform', 'AIController'])

    for (const entity of entities) {
      const tf = world.getComponent<TransformComponent>(entity, 'Transform')!
      const ai = world.getComponent<AIControllerComponent>(entity, 'AIController')!

      ai.stateTimer += dt
      if (ai.attackCooldownRemaining > 0) ai.attackCooldownRemaining -= dt

      // 特殊行为检测
      this._checkSpecialBehavior(world, entity, ai)

      switch (ai.state) {
        case 'idle': this._idle(world, entity, tf, ai, dt); break
        case 'patrol': this._patrol(world, entity, tf, ai, dt); break
        case 'alert': this._alert(world, entity, tf, ai, dt); break
        case 'attack': this._attack(world, entity, tf, ai, dt); break
        case 'flee': this._flee(world, tf, ai, dt); break
        case 'berserk': this._berserk(world, entity, tf, ai, dt); break
      }

      // 边界
      tf.x = Math.max(10, Math.min(this.canvasW - 10, tf.x))
      tf.y = Math.max(10, Math.min(this.canvasH - 10, tf.y))
    }
  }

  private _idle(world: World, entity: number, tf: TransformComponent, ai: AIControllerComponent, _dt: number): void {
    // 闲置 1~3 秒后开始巡逻
    if (ai.stateTimer > 1 + Math.random() * 2) {
      this._setState(ai, 'patrol')
      this._pickPatrolPoint(ai)
    }
    // 侦测敌人
    const threat = this._findThreat(world, entity, tf, ai)
    if (threat !== -1) { ai.targetId = threat; this._setState(ai, 'alert') }
  }

  private _patrol(_world: World, _entity: number, tf: TransformComponent, ai: AIControllerComponent, dt: number): void {
    const dx = ai.patrolX - tf.x
    const dy = ai.patrolY - tf.y
    const dsq = dx * dx + dy * dy

    if (dsq < 20 * 20) {
      this._setState(ai, 'idle')
      return
    }

    const dir = normalize(dx, dy)
    tf.vx = dir.x * ai.moveSpeed * 0.6
    tf.vy = dir.y * ai.moveSpeed * 0.6
    tf.x += tf.vx * dt
    tf.y += tf.vy * dt
    tf.rotation = Math.atan2(dir.y, dir.x)
  }

  private _alert(world: World, entity: number, tf: TransformComponent, ai: AIControllerComponent, _dt: number): void {
    // 面向目标，短暂停顿后发起攻击
    if (ai.targetId !== -1 && world.isAlive(ai.targetId)) {
      const ttf = world.getComponent<TransformComponent>(ai.targetId, 'Transform')
      if (ttf) tf.rotation = Math.atan2(ttf.y - tf.y, ttf.x - tf.x)
    }
    if (ai.stateTimer > 0.4) {
      this._setState(ai, 'attack')
    }
    // 目标丢失
    if (ai.targetId === -1 || !world.isAlive(ai.targetId)) {
      const threat = this._findThreat(world, entity, tf, ai)
      if (threat !== -1) ai.targetId = threat
      else this._setState(ai, 'idle')
    }
  }

  private _attack(world: World, entity: number, tf: TransformComponent, ai: AIControllerComponent, dt: number): void {
    if (ai.targetId === -1 || !world.isAlive(ai.targetId)) {
      this._setState(ai, 'patrol')
      this._pickPatrolPoint(ai)
      return
    }

    const ttf = world.getComponent<TransformComponent>(ai.targetId, 'Transform')!
    const dx = ttf.x - tf.x
    const dy = ttf.y - tf.y
    const dsq = dx * dx + dy * dy

    // 六翼霜蚣绕背
    if (ai.specialBehavior === 'flanker') {
      const flankAngle = Math.atan2(dy, dx) + Math.PI * 0.7
      const flankDist = 45
      const goalX = ttf.x + Math.cos(flankAngle) * flankDist
      const goalY = ttf.y + Math.sin(flankAngle) * flankDist
      const dir = normalize(goalX - tf.x, goalY - tf.y)
      tf.vx = dir.x * ai.moveSpeed * 1.4
      tf.vy = dir.y * ai.moveSpeed * 1.4
    } else {
      // 直线追击
      const dir = normalize(dx, dy)
      tf.vx = dir.x * ai.moveSpeed
      tf.vy = dir.y * ai.moveSpeed
    }

    tf.x += tf.vx * dt
    tf.y += tf.vy * dt
    tf.rotation = Math.atan2(dy, dx)

    // 攻击判定
    if (dsq < ai.attackRadius * ai.attackRadius && ai.attackCooldownRemaining <= 0) {
      const hp = world.getComponent<HealthComponent>(ai.targetId, 'Health')
      if (hp) hp.current = Math.max(0, hp.current - ai.attackDamage)
      ai.attackCooldownRemaining = ai.attackCooldown
    }

    // 逃跑检查
    const selfHp = world.getComponent<HealthComponent>(entity, 'Health')
    if (selfHp && selfHp.current / selfHp.max < ai.fleeThreshold) {
      this._setState(ai, 'flee')
    }
  }

  private _flee(_world: World, tf: TransformComponent, ai: AIControllerComponent, dt: number): void {
    const dir = normalize(ai.homeX - tf.x, ai.homeY - tf.y)
    tf.vx = dir.x * ai.moveSpeed * 1.5
    tf.vy = dir.y * ai.moveSpeed * 1.5
    tf.x += tf.vx * dt
    tf.y += tf.vy * dt

    const homeDsq = distSq(tf.x, tf.y, ai.homeX, ai.homeY)
    if (homeDsq < 30 * 30) {
      this._setState(ai, 'idle')
      ai.targetId = -1
    }
  }

  private _berserk(world: World, _entity: number, tf: TransformComponent, ai: AIControllerComponent, dt: number): void {
    // 狂暴模式：速度翻倍，无差别攻击，持续 5 秒
    if (ai.stateTimer > 5) {
      this._setState(ai, 'idle')
      ai.targetId = -1
      return
    }

    if (ai.targetId !== -1 && world.isAlive(ai.targetId)) {
      const ttf = world.getComponent<TransformComponent>(ai.targetId, 'Transform')!
      const dir = normalize(ttf.x - tf.x, ttf.y - tf.y)
      tf.vx = dir.x * ai.moveSpeed * 2.0
      tf.vy = dir.y * ai.moveSpeed * 2.0
      tf.x += tf.vx * dt
      tf.y += tf.vy * dt
      tf.rotation = Math.atan2(dir.y, dir.x)

      const dsq = distSq(tf.x, tf.y, ttf.x, ttf.y)
      if (dsq < ai.attackRadius * ai.attackRadius && ai.attackCooldownRemaining <= 0) {
        const hp = world.getComponent<HealthComponent>(ai.targetId, 'Health')
        if (hp) hp.current = Math.max(0, hp.current - ai.attackDamage * 2)
        ai.attackCooldownRemaining = ai.attackCooldown * 0.5
      }
    }
  }

  private _checkSpecialBehavior(world: World, entity: number, ai: AIControllerComponent): void {
    if (ai.specialBehavior !== 'ghost_hunter') return
    if (ai.state === 'berserk') return

    // 啼魂兽：检测范围内鬼道法宝 → 狂暴化
    const tf = world.getComponent<TransformComponent>(entity, 'Transform')!
    const allTags = world.query(['Transform', 'Tag'])
    for (const tid of allTags) {
      if (tid === entity) continue
      const tag = world.getComponent<TagComponent>(tid, 'Tag')!
      if (!tag.tags.has('ghost') && !tag.tags.has('demon')) continue
      const ttf = world.getComponent<TransformComponent>(tid, 'Transform')!
      if (distSq(tf.x, tf.y, ttf.x, ttf.y) < ai.senseRadius * ai.senseRadius) {
        ai.targetId = tid
        this._setState(ai, 'berserk')
        return
      }
    }
  }

  private _findThreat(world: World, self: number, tf: TransformComponent, ai: AIControllerComponent): number {
    const candidates = world.query(['Transform', 'Tag'])
    let best = -1, bestDsq = ai.senseRadius * ai.senseRadius

    for (const eid of candidates) {
      if (eid === self) continue
      const tag = world.getComponent<TagComponent>(eid, 'Tag')!
      if (tag.role !== 'player' && tag.role !== 'artifact') continue
      const etf = world.getComponent<TransformComponent>(eid, 'Transform')!
      const dsq = distSq(tf.x, tf.y, etf.x, etf.y)
      if (dsq < bestDsq) { bestDsq = dsq; best = eid }
    }
    return best
  }

  private _setState(ai: AIControllerComponent, state: AIControllerComponent['state']): void {
    ai.state = state
    ai.stateTimer = 0
  }

  private _pickPatrolPoint(ai: AIControllerComponent): void {
    const angle = Math.random() * Math.PI * 2
    const dist = Math.random() * ai.patrolRadius
    ai.patrolX = ai.homeX + Math.cos(angle) * dist
    ai.patrolY = ai.homeY + Math.sin(angle) * dist
  }
}
