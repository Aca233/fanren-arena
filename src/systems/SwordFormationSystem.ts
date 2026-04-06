import type { System } from '../ecs/types'
import type { World } from '../ecs/World'
import type { TransformComponent } from '../components/Transform'
import type { SwordFormationComponent, FormationMode } from '../components/SwordFormation'
import { createSwordFormation } from '../components/SwordFormation'
import type { BoidComponent } from '../components/Boid'
import type { DivineSenseComponent } from '../components/DivineSense'
import type { HealthComponent } from '../components/Stats'
import type { TagComponent } from '../components/Tag'
import type { TrailComponent } from '../components/SwordFormation'
import { createTransform } from '../components/Transform'
import { createRender } from '../components/Render'
import { createSpirituality } from '../components/Stats'
import { createCircleCollider, LAYER_ARTIFACT, LAYER_ENEMY } from '../components/Collider'
import { createTag } from '../components/Tag'
import { createBoid } from '../components/Boid'
import { createTrail } from '../components/SwordFormation'
import { distSq, normalize, lineSegmentVsCircle } from '../physics/collision'
import type { InputState } from './InputSystem'
import type { RenderComponent } from '../components/Render'
import type { ManaComponent } from '../components/Stats'
import { createInvincible } from '../components/Evasion'
import type { ColliderComponent } from '../components/Collider'

/**
 * SwordFormationSystem —— 青竹蜂云剑三形态控制
 */
export class SwordFormationSystem implements System {
  readonly name = 'SwordFormationSystem'

  private canvasW = 900
  private canvasH = 580

  setBounds(w: number, h: number): void { this.canvasW = w; this.canvasH = h }

  update(world: World, dt: number): void {
    const input = world.globals.input as InputState | undefined
    const formations = world.query(['SwordFormation'])

    for (const entity of formations) {
      const sf = world.getComponent<SwordFormationComponent>(entity, 'SwordFormation')!

      // 冷却
      if (sf.switchCooldown > 0) sf.switchCooldown -= dt

      // 绞杀模式：鼠标悬停自动锁定/离开自动解锁
      if (sf.mode === 'assault' && input) {
        const hoverTarget = this._findNearestEnemy(world, input.mouseX, input.mouseY, 35)
        if (hoverTarget !== -1 && hoverTarget !== sf.assaultTargetId) {
          sf.assaultTargetId = hoverTarget
        } else if (hoverTarget === -1 && sf.assaultTargetId !== -1) {
          // 鼠标离开 → 检查是否还在目标附近
          const ttf = world.getComponent<TransformComponent>(sf.assaultTargetId, 'Transform')
          if (ttf) {
            const dx = input.mouseX - ttf.x, dy = input.mouseY - ttf.y
            if (dx * dx + dy * dy > 60 * 60) sf.assaultTargetId = -1
          } else {
            sf.assaultTargetId = -1
          }
        }
      }

      // 神识消耗
      const ds = world.getComponent<DivineSenseComponent>(sf.ownerId, 'DivineSense')
      if (ds) {
        const drain = sf.mode === 'domain'
          ? sf.domainDivineDrain * dt
          : sf.divineDrainPerSec * dt
        ds.current = Math.min(ds.max, ds.current + drain * 0.1) // 缓慢增加消耗
      }

      // 清理已死亡的剑
      sf.swordIds = sf.swordIds.filter(sid => world.isAlive(sid))

      // 形态逻辑
      switch (sf.mode) {
        case 'guardian': this._updateGuardian(world, sf, dt); break
        case 'assault': this._updateAssault(world, sf, dt); break
        case 'domain': this._updateDomain(world, sf, dt); break
      }

      // 拖尾更新
      for (const sid of sf.swordIds) {
        const trail = world.getComponent<TrailComponent>(sid, 'Trail')
        const stf = world.getComponent<TransformComponent>(sid, 'Transform')
        if (trail && stf) {
          trail.positions.unshift({ x: stf.x, y: stf.y })
          if (trail.positions.length > trail.maxLength) trail.positions.pop()
        }
      }

      // ── 全剑接触伤害（任何模式下，每把剑都有实体伤害）──
      this._swordContactDamage(world, sf, dt)
    }

    // ── 回收动画 tick：飞剑飞回主人后销毁 ──
    const recalling = (world.globals._recallingSwords ?? []) as { id: number; ownerId: number }[]
    if (recalling.length > 0) {
      world.globals._recallingSwords = recalling.filter(entry => {
        if (!world.isAlive(entry.id)) return false
        const stf = world.getComponent<TransformComponent>(entry.id, 'Transform')
        const ownerTf = world.getComponent<TransformComponent>(entry.ownerId, 'Transform')
        if (!stf || !ownerTf) { world.destroyEntity(entry.id); return false }

        // 飞向主人
        const dx = ownerTf.x - stf.x
        const dy = ownerTf.y - stf.y
        const dsq = dx * dx + dy * dy
        if (dsq < 15 * 15) {
          // 到达：销毁
          world.destroyEntity(entry.id)
          return false
        }
        const d = Math.sqrt(dsq)
        const speed = 500
        stf.vx = (dx / d) * speed
        stf.vy = (dy / d) * speed
        stf.x += stf.vx * dt
        stf.y += stf.vy * dt
        stf.rotation = Math.atan2(dy, dx)

        // 拖尾
        const trail = world.getComponent<TrailComponent>(entry.id, 'Trail')
        if (trail) {
          trail.positions.unshift({ x: stf.x, y: stf.y })
          if (trail.positions.length > trail.maxLength) trail.positions.pop()
        }
        return true
      })
    }
  }

  /** 祭出 N 剑 */
  spawnSwords(world: World, ownerId: number, count = 72): number {
    const ownerTf = world.getComponent<TransformComponent>(ownerId, 'Transform')!

    // 创建主控实体
    const ctrl = world.createEntity()
    const sf = createSwordFormation(ownerId)
    sf.swordCount = count

    // 生成 N 把飞剑（从玩家位置飞出）
    for (let i = 0; i < count; i++) {
      const sid = this._spawnOneSword(world, ownerTf.x, ownerTf.y, i, count)
      sf.swordIds.push(sid)
    }

    world.addComponent(ctrl, sf)
    return ctrl
  }

  /** 动态调整在场剑数（实时增减） */
  adjustCount(world: World, ctrlId: number, newCount: number): void {
    const sf = world.getComponent<SwordFormationComponent>(ctrlId, 'SwordFormation')
    if (!sf) return
    const ownerTf = world.getComponent<TransformComponent>(sf.ownerId, 'Transform')
    if (!ownerTf) return

    // 清理已死亡
    sf.swordIds = sf.swordIds.filter(sid => world.isAlive(sid))
    const current = sf.swordIds.length

    if (newCount > current) {
      // 增加：从玩家位置飞出新剑
      for (let i = 0; i < newCount - current; i++) {
        const sid = this._spawnOneSword(world, ownerTf.x, ownerTf.y, current + i, newCount)
        sf.swordIds.push(sid)
      }
    } else if (newCount < current) {
      // 减少：多余的剑飞回玩家后销毁（标记为 recalling）
      const toRemove = sf.swordIds.splice(newCount)
      for (const sid of toRemove) {
        if (!world.isAlive(sid)) continue
        // 标记回收动画：设 Boid seekWeight 极高，目标为主人
        const boid = world.getComponent<BoidComponent>(sid, 'Boid')
        if (boid) { boid.targetId = -1; boid.seekWeight = 0 }
        // 用 globals 记录回收中的剑
        const recalling = (world.globals._recallingSwords ?? []) as { id: number; ownerId: number }[]
        recalling.push({ id: sid, ownerId: sf.ownerId })
        world.globals._recallingSwords = recalling
      }
    }
    sf.swordCount = newCount
  }

  /** 全部回收（飞回动画） */
  recallAll(world: World, ctrlId: number): void {
    const sf = world.getComponent<SwordFormationComponent>(ctrlId, 'SwordFormation')
    if (!sf) return

    // 清理 domain 状态
    if (sf.domainPhase !== 'none') {
      sf.domainPhase = 'none'
      sf.domainTimer = 0
      sf.swordSilks = []
      sf.darkenAlpha = 0
      sf.broken = false
      world.globals.domainCircle = null
      world.globals.domainDarken = 0
      world.globals.hitStop = 0
    }

    // 恢复飞剑可见并加入回收队列
    const recalling = (world.globals._recallingSwords ?? []) as { id: number; ownerId: number }[]
    for (const sid of sf.swordIds) {
      if (!world.isAlive(sid)) continue
      const render = world.getComponent<RenderComponent>(sid, 'Render')
      if (render) render.visible = true
      const boid = world.getComponent<BoidComponent>(sid, 'Boid')
      if (boid) { boid.targetId = -1; boid.seekWeight = 0 }
      recalling.push({ id: sid, ownerId: sf.ownerId })
    }
    world.globals._recallingSwords = recalling
    sf.swordIds = []
    sf.swordCount = 0
  }

  /** 生成单把飞剑（从玩家位置向外爆发） */
  private _spawnOneSword(world: World, ox: number, oy: number, index: number, total: number): number {
    const angle = (index / total) * Math.PI * 2
    const sid = world.createEntity()

    // 起始于玩家中心，给予向外的爆发速度
    const stf = createTransform(ox, oy)
    stf.vx = Math.cos(angle) * 120  // 缓展飞出
    stf.vy = Math.sin(angle) * 120
    stf.rotation = angle

    const render = createRender(3, '#d4af37')
    render.glowColor = '#aa880088'

    world
      .addComponent(sid, stf)
      .addComponent(sid, render)
      .addComponent(sid, createSpirituality(30))
      .addComponent(sid, createCircleCollider(3, 0.15, {
        layer: LAYER_ARTIFACT,
        mask: LAYER_ENEMY,
      }))
      .addComponent(sid, createTag('artifact', ['wood', 'lightning', 'evil_warding', 'natal']))
      .addComponent(sid, createBoid('qingzhu_72', {
        separationWeight: 1.5,
        alignmentWeight: 1.0,
        cohesionWeight: 0.8,
        maxSpeed: 350,
        maxForce: 500,
        perceptionRadius: 60,
        separationRadius: 15,
        targetId: -1,
        seekWeight: 2.5,
      }))
      .addComponent(sid, createTrail('#d4af3744', 1.5, 6))

    return sid
  }

  /** 外部 API：设置护体比例 */
  setGuardRatio(world: World, ctrlId: number, ratio: number): void {
    const sf = world.getComponent<SwordFormationComponent>(ctrlId, 'SwordFormation')
    if (sf) sf.guardRatio = Math.max(0, Math.min(1, ratio))
  }

  /** 外部 API：切换形态（供 UI 按钮调用） */
  setMode(world: World, ctrlId: number, mode: FormationMode): void {
    const sf = world.getComponent<SwordFormationComponent>(ctrlId, 'SwordFormation')
    if (!sf) return
    if (sf.mode === mode) return
    if (sf.switchCooldown > 0) return
    this._switchMode(world, sf, mode)
    sf.switchCooldown = sf.switchCooldownMax
  }

  private _switchMode(world: World, sf: SwordFormationComponent, mode: FormationMode): void {
    // ── 退出当前模式清理 ──

    // 退出 assault：清除追踪目标、归零速度
    if (sf.mode === 'assault') {
      for (const sid of sf.swordIds) {
        if (!world.isAlive(sid)) continue
        const boid = world.getComponent<BoidComponent>(sid, 'Boid')
        if (boid) boid.targetId = -1
        const stf = world.getComponent<TransformComponent>(sid, 'Transform')
        if (stf) { stf.vx = 0; stf.vy = 0 }
      }
      sf.assaultTargetId = -1
    }

    // 退出 domain：恢复飞剑、清除标记
    if (sf.mode === 'domain' && sf.domainPhase !== 'none') {
      sf.domainPhase = 'none'
      sf.domainTimer = 0
      sf.swordSilks = []
      sf.darkenAlpha = 0
      sf.coreHealth = sf.coreHealthMax
      sf.broken = false
      world.globals.domainCircle = null
      world.globals.domainDarken = 0
      world.globals.hitStop = 0
      for (const sid of sf.swordIds) {
        if (!world.isAlive(sid)) continue
        const render = world.getComponent<RenderComponent>(sid, 'Render')
        if (render) render.visible = true
        const boid = world.getComponent<BoidComponent>(sid, 'Boid')
        if (boid) boid.targetId = -1
        const stf = world.getComponent<TransformComponent>(sid, 'Transform')
        if (stf) { stf.vx = 0; stf.vy = 0 }
      }
    }

    // ── 进入新模式 ──
    sf.mode = mode

    if (mode === 'guardian') {
      // 重置所有飞剑到环绕状态
      for (const sid of sf.swordIds) {
        if (!world.isAlive(sid)) continue
        const boid = world.getComponent<BoidComponent>(sid, 'Boid')
        if (boid) boid.targetId = -1
      }
    }

    if (mode === 'assault') {
      for (const sid of sf.swordIds) {
        if (!world.isAlive(sid)) continue
        const boid = world.getComponent<BoidComponent>(sid, 'Boid')
        if (boid) boid.targetId = sf.assaultTargetId
      }
    }

    if (mode === 'domain') {
      // 消耗 50% 法力
      const mana = world.getComponent<ManaComponent>(sf.ownerId, 'Mana')
      if (mana) {
        if (mana.current < mana.max * sf.domainManaCost) {
          // 法力不足，无法展开
          sf.mode = 'guardian'
          return
        }
        mana.current -= mana.max * sf.domainManaCost
      }
      sf.domainPhase = 'deploying'
      sf.domainTimer = 0
      sf.slashTimer = 0
      sf.swordSilks = []
      sf.broken = false
      sf.coreHealth = sf.coreHealthMax
      sf.darkenAlpha = 0
      // 锁定阵心位置：鼠标位置（若有输入），否则玩家位置
      const input = world.globals.input as InputState | undefined
      const ownerTf = world.getComponent<TransformComponent>(sf.ownerId, 'Transform')
      if (input && input.mouseX > 0) {
        sf.domainCenterX = input.mouseX
        sf.domainCenterY = input.mouseY
      } else if (ownerTf) {
        sf.domainCenterX = ownerTf.x
        sf.domainCenterY = ownerTf.y
      }
      // 布阵期间无敌
      world.addComponent(sf.ownerId, createInvincible(sf.deployDuration, 'skill'))
    }
  }

  /** 游鱼护体 —— 只控制 guardRatio 比例的剑，其余闲置 */
  private _updateGuardian(world: World, sf: SwordFormationComponent, dt: number): void {
    const ownerTf = world.getComponent<TransformComponent>(sf.ownerId, 'Transform')
    if (!ownerTf) return

    const guardCount = Math.max(1, Math.round(sf.swordIds.length * sf.guardRatio))

    for (let i = 0; i < sf.swordIds.length; i++) {
      const sid = sf.swordIds[i]
      if (!world.isAlive(sid)) continue

      const boid = world.getComponent<BoidComponent>(sid, 'Boid')
      const stf = world.getComponent<TransformComponent>(sid, 'Transform')!
      const render = world.getComponent<RenderComponent>(sid, 'Render')

      if (i < guardCount) {
        // 护体剑：环绕主人
        if (render) render.visible = true
        if (boid) boid.targetId = -1

        const baseAngle = (i / guardCount) * Math.PI * 2
        const orbit = baseAngle + Date.now() * 0.003
        const targetX = ownerTf.x + Math.cos(orbit) * sf.guardRadius
        const targetY = ownerTf.y + Math.sin(orbit) * sf.guardRadius

        const dx = targetX - stf.x
        const dy = targetY - stf.y
        const distToTarget = Math.sqrt(dx * dx + dy * dy)

        const lerpS = distToTarget > sf.guardRadius * 3 ? 20 : 12
        stf.x += dx * lerpS * dt
        stf.y += dy * lerpS * dt
        stf.vx = dx * lerpS
        stf.vy = dy * lerpS

        const vel = Math.sqrt(stf.vx * stf.vx + stf.vy * stf.vy)
        if (vel > 5) stf.rotation = Math.atan2(stf.vy, stf.vx)
      } else {
        // 闲置剑：跟在主人背后（相对朝向）松散浮动
        if (render) render.visible = true
        if (boid) boid.targetId = -1
        const ownerRot = ownerTf.rotation ?? 0
        const behindAngle = ownerRot + Math.PI // 背面方向
        const idleIdx = i - guardCount
        const idleTotal = sf.swordIds.length - guardCount
        const spread = Math.PI * 0.6 // 背后扇形范围
        const frac = idleTotal > 1 ? (idleIdx / (idleTotal - 1)) - 0.5 : 0
        const idleAngle = behindAngle + frac * spread
        const idleR = sf.guardRadius * 1.2 + (idleIdx % 3) * 10
        const tx = ownerTf.x + Math.cos(idleAngle) * idleR
        const ty = ownerTf.y + Math.sin(idleAngle) * idleR
        stf.x += (tx - stf.x) * 8 * dt
        stf.y += (ty - stf.y) * 8 * dt
        stf.vx = (tx - stf.x) * 8
        stf.vy = (ty - stf.y) * 8
        stf.rotation = ownerRot // 朝向与主人一致
      }
    }

    // 自动拦截：只用护体剑
    this._autoIntercept(world, sf, ownerTf, dt)
  }

  /** 自动拦截来袭弹幕 */
  private _autoIntercept(
    world: World, sf: SwordFormationComponent,
    ownerTf: TransformComponent, _dt: number,
  ): void {
    const threats = world.query(['Transform', 'Projectile'])
    for (const tid of threats) {
      const ttf = world.getComponent<TransformComponent>(tid, 'Transform')!
      if (distSq(ownerTf.x, ownerTf.y, ttf.x, ttf.y) > 120 * 120) continue

      // 指派最近的 3 把剑拦截
      let assigned = 0
      for (const sid of sf.swordIds) {
        if (assigned >= 3) break
        if (!world.isAlive(sid)) continue
        const stf = world.getComponent<TransformComponent>(sid, 'Transform')!
        if (distSq(stf.x, stf.y, ttf.x, ttf.y) < 50 * 50) {
          const dir = normalize(ttf.x - stf.x, ttf.y - stf.y)
          stf.vx += dir.x * 400
          stf.vy += dir.y * 400
          assigned++
        }
      }
    }
  }

  /** 蜂云绞杀 —— guardRatio 部分护体，其余进攻 */
  private _updateAssault(world: World, sf: SwordFormationComponent, dt: number): void {
    const input = world.globals.input as InputState | undefined
    const ownerTf = world.getComponent<TransformComponent>(sf.ownerId, 'Transform')

    // 目标失效 → 清除
    if (sf.assaultTargetId !== -1 && !world.isAlive(sf.assaultTargetId)) {
      sf.assaultTargetId = -1
    }

    const guardCount = Math.round(sf.swordIds.length * sf.guardRatio)
    const now = Date.now()

    for (let i = 0; i < sf.swordIds.length; i++) {
      const sid = sf.swordIds[i]
      if (!world.isAlive(sid)) continue
      const stf = world.getComponent<TransformComponent>(sid, 'Transform')!
      const boid = world.getComponent<BoidComponent>(sid, 'Boid')
      const render = world.getComponent<RenderComponent>(sid, 'Render')
      if (render) render.visible = true
      if (boid) boid.targetId = -1

      // ── 护体剑：环绕主人 ──
      if (i < guardCount && ownerTf) {
        const baseAngle = (i / Math.max(1, guardCount)) * Math.PI * 2
        const orbit = baseAngle + now * 0.003
        const tx = ownerTf.x + Math.cos(orbit) * sf.guardRadius
        const ty = ownerTf.y + Math.sin(orbit) * sf.guardRadius
        stf.x += (tx - stf.x) * 12 * dt
        stf.y += (ty - stf.y) * 12 * dt
        stf.vx = (tx - stf.x) * 12
        stf.vy = (ty - stf.y) * 12
        const vel = Math.sqrt(stf.vx * stf.vx + stf.vy * stf.vy)
        if (vel > 5) stf.rotation = Math.atan2(stf.vy, stf.vx)
        continue
      }

      // ── 进攻剑索引（从0开始） ──
      const atkIdx = i - guardCount
      const atkTotal = sf.swordIds.length - guardCount
      const phase = atkIdx * 1.618

      // ── 有锁定目标 → 绞杀 ──
      if (sf.assaultTargetId !== -1) {
        const ttf = world.getComponent<TransformComponent>(sf.assaultTargetId, 'Transform')
        if (!ttf) continue
        const groupIdx = atkIdx % 3

        if (groupIdx === 0) {
          // 穿刺组
          const cycleTime = 1.2 + (atkIdx % 5) * 0.2
          const t = ((now * 0.001 + phase) % cycleTime) / cycleTime
          const rushAngle = phase * 2.3 + Math.floor(now * 0.001 / cycleTime) * 1.2
          if (t < 0.4) {
            const startX = ttf.x + Math.cos(rushAngle) * 90
            const startY = ttf.y + Math.sin(rushAngle) * 90
            const endX = ttf.x - Math.cos(rushAngle) * 90
            const endY = ttf.y - Math.sin(rushAngle) * 90
            const p = t / 0.4
            const tx = startX + (endX - startX) * p
            const ty = startY + (endY - startY) * p
            stf.x += (tx - stf.x) * 15 * dt
            stf.y += (ty - stf.y) * 15 * dt
          } else {
            const startX = ttf.x + Math.cos(rushAngle) * 90
            const startY = ttf.y + Math.sin(rushAngle) * 90
            stf.x += (startX - stf.x) * 6 * dt
            stf.y += (startY - stf.y) * 6 * dt
          }
          stf.rotation = Math.atan2(ttf.y - stf.y, ttf.x - stf.x)
        } else if (groupIdx === 1) {
          // 环绕组
          const orbitSpeed = 6 + (atkIdx % 4)
          const orbitR = 20 + (atkIdx % 3) * 10
          const angle = phase + now * 0.001 * orbitSpeed
          const tx = ttf.x + Math.cos(angle) * orbitR
          const ty = ttf.y + Math.sin(angle) * orbitR
          stf.x += (tx - stf.x) * 12 * dt
          stf.y += (ty - stf.y) * 12 * dt
          stf.rotation = Math.atan2(ttf.y - stf.y, ttf.x - stf.x)
        } else {
          // 游弋组
          const buzz = Math.sin(now * 0.01 + phase * 5) * 30
          const buzzY = Math.cos(now * 0.008 + phase * 3) * 25
          const outerR = 50 + (atkIdx % 5) * 8
          const angle = phase + now * 0.001 * 3
          const tx = ttf.x + Math.cos(angle) * outerR + buzz
          const ty = ttf.y + Math.sin(angle) * outerR + buzzY
          stf.x += (tx - stf.x) * 8 * dt
          stf.y += (ty - stf.y) * 8 * dt
          stf.rotation = Math.atan2(ttf.y - stf.y, ttf.x - stf.x)
        }
        // 接触伤害由 _swordContactDamage 统一处理
      }
      // ── 无锁定 → 跟随鼠标 ──
      else if (input) {
        const mx = input.mouseX, my = input.mouseY
        const offsetAngle = (atkIdx / Math.max(1, atkTotal)) * Math.PI * 2 + now * 0.005
        const offsetR = 15 + (atkIdx % 4) * 8
        const buzz = Math.sin(now * 0.008 + phase * 7) * 35
        const buzzY = Math.cos(now * 0.006 + phase * 5) * 25
        const tx = mx + Math.cos(offsetAngle) * offsetR + buzz
        const ty = my + Math.sin(offsetAngle) * offsetR + buzzY
        const dx = tx - stf.x, dy = ty - stf.y
        const speed = Math.min(8, 2 + Math.sqrt(dx * dx + dy * dy) * 0.01)
        stf.x += dx * speed * dt
        stf.y += dy * speed * dt
        stf.rotation = Math.atan2(my - stf.y, mx - stf.x)
      }
    }
  }

  /** 大庚剑阵 —— 三阶段生命周期 */
  private _updateDomain(world: World, sf: SwordFormationComponent, dt: number): void {
    sf.domainTimer += dt
    const cx = sf.domainCenterX
    const cy = sf.domainCenterY

    // 神识持续占用（80% 神识槽）
    const ds = world.getComponent<DivineSenseComponent>(sf.ownerId, 'DivineSense')
    if (ds) {
      ds.current = Math.min(ds.max, ds.max * 0.8)
    }

    switch (sf.domainPhase) {
      case 'deploying': this._domainDeploy(world, sf, cx, cy, dt); break
      case 'active': this._domainActive(world, sf, cx, cy, dt); break
      case 'collapsing': this._domainCollapse(world, sf, dt); break
    }

    // 写入渲染数据
    world.globals.domainCircle = sf.domainPhase !== 'none' ? {
      x: cx, y: cy, radius: sf.domainRadius,
      timer: sf.domainTimer, phase: sf.domainPhase,
      swordSilks: sf.swordSilks,
      deployDuration: sf.deployDuration,
      activeDuration: sf.activeDuration,
      coreHealth: sf.coreHealth, coreHealthMax: sf.coreHealthMax,
    } : null
    world.globals.domainDarken = sf.darkenAlpha
  }

  /** 阶段一：布阵（1.5s 无敌 + 飞剑排列：外圈一圈 + 内部填充） */
  private _domainDeploy(
    world: World, sf: SwordFormationComponent,
    cx: number, cy: number, dt: number,
  ): void {
    const progress = Math.min(1, sf.domainTimer / sf.deployDuration)
    sf.darkenAlpha = progress * 0.45
    const ownerTf = world.getComponent<TransformComponent>(sf.ownerId, 'Transform')

    const guardCount = Math.round(sf.swordIds.length * sf.guardRatio)
    const domainSwords = sf.swordIds.slice(guardCount)
    const positions = this._calcDomainPositions(domainSwords.length, cx, cy, sf.domainRadius)

    for (let i = 0; i < sf.swordIds.length; i++) {
      const sid = sf.swordIds[i]
      if (!world.isAlive(sid)) continue
      const stf = world.getComponent<TransformComponent>(sid, 'Transform')!
      const render = world.getComponent<RenderComponent>(sid, 'Render')
      const boid = world.getComponent<BoidComponent>(sid, 'Boid')
      if (render) render.visible = true
      if (boid) boid.targetId = -1

      if (i < guardCount && ownerTf) {
        // 护体剑继续环绕主人
        const baseAngle = (i / Math.max(1, guardCount)) * Math.PI * 2
        const orbit = baseAngle + Date.now() * 0.003
        const tx = ownerTf.x + Math.cos(orbit) * sf.guardRadius
        const ty = ownerTf.y + Math.sin(orbit) * sf.guardRadius
        stf.x += (tx - stf.x) * 12 * dt
        stf.y += (ty - stf.y) * 12 * dt
        const vel = Math.sqrt((tx - stf.x) * (tx - stf.x) + (ty - stf.y) * (ty - stf.y))
        if (vel > 1) stf.rotation = Math.atan2(ty - stf.y, tx - stf.x)
      } else {
        // 阵剑飞向阵位
        const pos = positions[i - guardCount]
        if (pos) {
          stf.x += (pos.x - stf.x) * 5 * dt
          stf.y += (pos.y - stf.y) * 5 * dt
          stf.rotation = Math.atan2(cy - stf.y, cx - stf.x)
        }
      }
      stf.x = Math.max(5, Math.min(this.canvasW - 5, stf.x))
      stf.y = Math.max(5, Math.min(this.canvasH - 5, stf.y))
    }

    if (sf.domainTimer >= sf.deployDuration) {
      sf.domainPhase = 'active'
      sf.domainTimer = 0
      sf.slashTimer = 0
    }
  }

  /** 交错同心圆排布：外圈均匀摆放，内圈插在外圈间隙中，逐圈向内收缩 */
  private _calcDomainPositions(
    count: number, cx: number, cy: number, radius: number,
  ): { x: number; y: number }[] {
    const positions: { x: number; y: number }[] = []
    if (count <= 0) return positions

    const spacing = 38
    let ringR = radius * 0.92
    let remaining = count
    let ringIdx = 0
    let prevCount = 0
    let prevOffset = 0

    while (remaining > 0 && ringR > 8) {
      const circumference = 2 * Math.PI * ringR
      const ringCount = Math.min(remaining, Math.max(3, Math.floor(circumference / spacing)))

      // 交错：奇数环在偶数环的间隙处（半角偏移）
      let angleOffset = 0
      if (ringIdx > 0 && prevCount > 0) {
        angleOffset = prevOffset + (Math.PI / prevCount) // 插在上一圈两剑中间
      }

      for (let i = 0; i < ringCount; i++) {
        const angle = (i / ringCount) * Math.PI * 2 + angleOffset
        positions.push({
          x: cx + Math.cos(angle) * ringR,
          y: cy + Math.sin(angle) * ringR,
        })
      }

      prevOffset = angleOffset
      prevCount = ringCount
      remaining -= ringCount
      ringR -= spacing * 1.1 // 环间距略紧凑
      ringIdx++
    }

    // 剩余放阵心
    for (let i = 0; i < remaining; i++) {
      const angle = (i / Math.max(1, remaining)) * Math.PI * 2
      positions.push({ x: cx + Math.cos(angle) * 8, y: cy + Math.sin(angle) * 8 })
    }

    return positions
  }

  /** 阶段二：绞杀（射线切割 + 减速 + 禁遁） */
  private _domainActive(
    world: World, sf: SwordFormationComponent,
    cx: number, cy: number, dt: number,
  ): void {
    sf.darkenAlpha = 0.45

    // ── 飞剑保持阵位，缓慢旋转（尊重 guardRatio）──
    const ownerTf = world.getComponent<TransformComponent>(sf.ownerId, 'Transform')
    const guardCount = Math.round(sf.swordIds.length * sf.guardRatio)
    const domainSwords = sf.swordIds.slice(guardCount)
    const positions = this._calcDomainPositions(domainSwords.length, cx, cy, sf.domainRadius)
    const rotOffset = sf.domainTimer * 0.15

    for (let i = 0; i < sf.swordIds.length; i++) {
      const sid = sf.swordIds[i]
      if (!world.isAlive(sid)) continue
      const stf = world.getComponent<TransformComponent>(sid, 'Transform')!
      const render = world.getComponent<RenderComponent>(sid, 'Render')
      const boid = world.getComponent<BoidComponent>(sid, 'Boid')
      if (render) render.visible = true
      if (boid) boid.targetId = -1

      if (i < guardCount && ownerTf) {
        // 护体剑环绕主人
        const baseAngle = (i / Math.max(1, guardCount)) * Math.PI * 2
        const orbit = baseAngle + Date.now() * 0.003
        const tx = ownerTf.x + Math.cos(orbit) * sf.guardRadius
        const ty = ownerTf.y + Math.sin(orbit) * sf.guardRadius
        stf.x += (tx - stf.x) * 12 * dt
        stf.y += (ty - stf.y) * 12 * dt
        const vel = Math.sqrt((tx - stf.x) ** 2 + (ty - stf.y) ** 2)
        if (vel > 1) stf.rotation = Math.atan2(ty - stf.y, tx - stf.x)
      } else {
        // 阵剑缓旋
        const pos = positions[i - guardCount]
        if (pos) {
          const dx = pos.x - cx, dy = pos.y - cy
          const a = Math.atan2(dy, dx) + rotOffset
          const r = Math.sqrt(dx * dx + dy * dy)
          const tx = cx + Math.cos(a) * r
          const ty = cy + Math.sin(a) * r
          stf.x += (tx - stf.x) * 8 * dt
          stf.y += (ty - stf.y) * 8 * dt
          stf.rotation = Math.atan2(cy - stf.y, cx - stf.x)
        }
      }
    }

    // ── 剑丝射线切割 ──
    sf.slashTimer += dt
    sf.swordSilks = sf.swordSilks.filter(s => { s.alpha -= dt * 3; return s.alpha > 0 })

    if (sf.slashTimer >= sf.slashInterval) {
      sf.slashTimer = 0
      const r = sf.domainRadius

      // 剑丝数量随阵内剑数缩放（更多剑=更多剑丝=更高伤害）
      const guardCount = Math.round(sf.swordIds.length * sf.guardRatio)
      const domainSwordCount = Math.max(1, sf.swordIds.length - guardCount)
      const silkCount = Math.max(1, Math.floor(domainSwordCount / 10)) + Math.floor(Math.random() * 2)
      for (let i = 0; i < silkCount; i++) {
        const a1 = Math.random() * Math.PI * 2
        const a2 = a1 + 0.5 + Math.random() * 2.0
        const r1 = 0.3 + Math.random() * 0.7
        const r2 = 0.3 + Math.random() * 0.7
        const x1 = cx + Math.cos(a1) * r * r1
        const y1 = cy + Math.sin(a1) * r * r1
        const x2 = cx + Math.cos(a2) * r * r2
        const y2 = cy + Math.sin(a2) * r * r2

        sf.swordSilks.push({ x1, y1, x2, y2, alpha: 1.0 })

        // 射线-圆相交检测
        const enemies = world.query(['Transform', 'Collider', 'Tag'])
        for (const eid of enemies) {
          if (eid === sf.ownerId) continue
          const tag = world.getComponent<TagComponent>(eid, 'Tag')!
          if (tag.role !== 'dummy' && tag.role !== 'enemy') continue
          const etf = world.getComponent<TransformComponent>(eid, 'Transform')!
          // 先粗筛：在领域内
          if (distSq(cx, cy, etf.x, etf.y) > r * r) continue
          const col = world.getComponent<ColliderComponent>(eid, 'Collider')!
          const hitR = col.rx

          if (lineSegmentVsCircle(x1, y1, x2, y2, etf.x, etf.y, hitR)) {
            const hp = world.getComponent<HealthComponent>(eid, 'Health')
            if (hp) {
              // 真实伤害（随阵内剑数缩放）
              let dmg = sf.slashDamage * (1 + domainSwordCount / 72)
              // 辟邪神雷加成
              if (tag.tags.has('demon') || tag.tags.has('ghost')) dmg *= 3
              hp.current = Math.max(0, hp.current - dmg)

              // 顿帧（Hit Stop）
              world.globals.hitStop = 0.03
            }
          }
        }
      }
    }

    // ── 领域内减速 + 禁遁 ──
    const allEntities = world.query(['Transform', 'Tag'])
    for (const eid of allEntities) {
      if (eid === sf.ownerId) continue
      const etf = world.getComponent<TransformComponent>(eid, 'Transform')!
      if (distSq(cx, cy, etf.x, etf.y) > sf.domainRadius * sf.domainRadius) continue
      const tag = world.getComponent<TagComponent>(eid, 'Tag')!
      if (tag.role !== 'dummy' && tag.role !== 'enemy') continue

      // 减速
      etf.vx *= sf.slowMultiplier
      etf.vy *= sf.slowMultiplier

      // 禁遁术
      world.globals[`no_evasion_${eid}`] = true
    }

    // ── 阵眼可被攻击 ──
    // 简化：领域内的敌方法宝攻击可消耗阵眼生命值
    const artifacts = world.query(['Transform', 'Tag'])
    for (const aid of artifacts) {
      const atag = world.getComponent<TagComponent>(aid, 'Tag')!
      if (atag.role !== 'artifact' || atag.tags.has('natal')) continue
      const atf = world.getComponent<TransformComponent>(aid, 'Transform')!
      if (distSq(cx, cy, atf.x, atf.y) < sf.domainRadius * sf.domainRadius) {
        sf.coreHealth -= 15 * dt // 敌方法宝在阵内持续消耗阵眼
      }
    }

    // ── 破阵判定 ──
    if (sf.coreHealth <= 0) {
      sf.broken = true
      sf.domainPhase = 'collapsing'
      sf.domainTimer = 0
      return
    }

    // ── 时间到期 → 正常收阵 ──
    if (sf.domainTimer >= sf.activeDuration) {
      sf.domainPhase = 'collapsing'
      sf.domainTimer = 0
    }
  }

  /** 阶段三：收阵/破阵 */
  private _domainCollapse(
    world: World, sf: SwordFormationComponent, dt: number,
  ): void {
    // 环境恢复亮度
    sf.darkenAlpha = Math.max(0, sf.darkenAlpha - dt * 1.5)
    sf.swordSilks = []

    if (sf.broken) {
      // 破阵：屏幕震动 + 神识重创
      if (sf.domainTimer < 0.1) {
        world.globals.hitStop = 0.08
        const ds = world.getComponent<DivineSenseComponent>(sf.ownerId, 'DivineSense')
        if (ds) {
          ds.overloaded = true
          ds.overloadStun = 2.0
          ds.max = Math.max(20, ds.max - 10) // 永久扣除神识上限
        }
        world.globals._divineOverloaded = true
      }
    }

    // 飞剑重新凝聚
    for (const sid of sf.swordIds) {
      if (!world.isAlive(sid)) continue
      const render = world.getComponent<RenderComponent>(sid, 'Render')
      if (render) render.visible = true
    }

    if (sf.domainTimer >= sf.collapseDuration) {
      this._switchMode(world, sf, 'guardian')
    }
  }

  /** 全剑接触伤害 —— 每把剑都是实体，碰到敌人就造成伤害 */
  private _swordContactDamage(world: World, sf: SwordFormationComponent, dt: number): void {
    const enemies = world.query(['Transform', 'Health', 'Tag'])
    const hitCooldownKey = '_swordHitCD'

    for (const sid of sf.swordIds) {
      if (!world.isAlive(sid)) continue
      const stf = world.getComponent<TransformComponent>(sid, 'Transform')!

      for (const eid of enemies) {
        if (eid === sf.ownerId) continue
        const tag = world.getComponent<TagComponent>(eid, 'Tag')!
        if (tag.role !== 'dummy' && tag.role !== 'enemy') continue
        const etf = world.getComponent<TransformComponent>(eid, 'Transform')!
        const col = world.getComponent<ColliderComponent>(eid, 'Collider')

        const hitR = (col?.rx ?? 20) + 5
        const dx = etf.x - stf.x, dy = etf.y - stf.y
        if (dx * dx + dy * dy > hitR * hitR) continue

        // 每把剑对每个敌人有独立冷却（0.2s），防止叠伤太快
        const cdKey = `${hitCooldownKey}_${sid}_${eid}`
        const cd = (world.globals[cdKey] ?? 0) as number
        if (cd > 0) continue

        const hp = world.getComponent<HealthComponent>(eid, 'Health')!
        let dmg = 15 // 单剑基础伤害

        // 辟邪神雷克制加成
        if (tag.tags.has('demon') || tag.tags.has('ghost')) dmg *= 3

        hp.current = Math.max(0, hp.current - dmg)
        world.globals[cdKey] = 0.2 // 0.2s 冷却

        // ── 攻击反馈：轻推 + 剑弹回 ──
        const pushStr = 30
        etf.vx += (dx / hitR) * pushStr
        etf.vy += (dy / hitR) * pushStr
        stf.vx -= (dx / hitR) * pushStr * 0.5
        stf.vy -= (dy / hitR) * pushStr * 0.5
      }
    }

    // tick 冷却
    for (const key of Object.keys(world.globals)) {
      if (key.startsWith(hitCooldownKey) && typeof world.globals[key] === 'number') {
        (world.globals[key] as number) > 0
          ? world.globals[key] = (world.globals[key] as number) - dt
          : delete world.globals[key]
      }
    }
  }

  private _findNearestEnemy(world: World, mx: number, my: number, maxDist: number): number {
    const entities = world.query(['Transform', 'Tag'])
    let best = -1, bestDsq = maxDist * maxDist
    for (const eid of entities) {
      const tag = world.getComponent<TagComponent>(eid, 'Tag')!
      if (tag.role !== 'dummy' && tag.role !== 'enemy') continue
      const tf = world.getComponent<TransformComponent>(eid, 'Transform')!
      const dsq = distSq(tf.x, tf.y, mx, my)
      if (dsq < bestDsq) { bestDsq = dsq; best = eid }
    }
    return best
  }
}
