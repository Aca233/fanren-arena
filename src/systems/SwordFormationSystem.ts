import type { System } from '../ecs/types'
import type { World } from '../ecs/World'
import type { TransformComponent } from '../components/Transform'
import type { SwordFormationComponent, FormationMode } from '../components/SwordFormation'
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
import { distSq, normalize } from '../physics/collision'
import type { InputState } from './InputSystem'
import type { RenderComponent } from '../components/Render'

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

      // F 键切换形态
      if (input?.justPressed.has('KeyF') && sf.switchCooldown <= 0) {
        const modes: FormationMode[] = ['guardian', 'assault', 'domain']
        const idx = modes.indexOf(sf.mode)
        const next = modes[(idx + 1) % 3]
        this._switchMode(world, sf, next)
        sf.switchCooldown = sf.switchCooldownMax
      }

      // 右键指派攻击目标（assault 模式）
      if (input?.mouseJustPressed.has(2) && sf.mode === 'assault') {
        const target = this._findNearestEnemy(world, input.mouseX, input.mouseY, 80)
        if (target !== -1) {
          sf.assaultTargetId = target
          for (const sid of sf.swordIds) {
            if (!world.isAlive(sid)) continue
            const boid = world.getComponent<BoidComponent>(sid, 'Boid')
            if (boid) boid.targetId = target
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
    const sf = {
      type: 'SwordFormation' as const,
      ownerId,
      mode: 'guardian' as FormationMode,
      switchCooldown: 0, switchCooldownMax: 1.5,
      swordIds: [] as number[],
      swordCount: count,
      guardRadius: 55,
      assaultTargetId: -1,
      domainRadius: 220,
      domainActive: false,
      domainTimer: 0, domainMaxDuration: 8,
      slashTimer: 0, slashInterval: 0.1,
      divineDrainPerSec: 2,
      domainDivineDrain: 8,
    }

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
    const recalling = (world.globals._recallingSwords ?? []) as { id: number; ownerId: number }[]
    for (const sid of sf.swordIds) {
      if (!world.isAlive(sid)) continue
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

    // 退出 domain：恢复飞剑可见、清除领域标记
    if (sf.mode === 'domain' && sf.domainActive) {
      sf.domainActive = false
      sf.domainTimer = 0
      world.globals.domainCircle = null
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
      sf.domainActive = true
      sf.domainTimer = 0
      sf.slashTimer = 0
    }
  }

  /** 游鱼护体 */
  private _updateGuardian(world: World, sf: SwordFormationComponent, dt: number): void {
    const ownerTf = world.getComponent<TransformComponent>(sf.ownerId, 'Transform')
    if (!ownerTf) return

    for (let i = 0; i < sf.swordIds.length; i++) {
      const sid = sf.swordIds[i]
      if (!world.isAlive(sid)) continue

      const boid = world.getComponent<BoidComponent>(sid, 'Boid')
      const stf = world.getComponent<TransformComponent>(sid, 'Transform')!

      // 围绕主人的目标点（螺旋分布）
      const baseAngle = (i / sf.swordIds.length) * Math.PI * 2
      const orbit = baseAngle + Date.now() * 0.003
      const targetX = ownerTf.x + Math.cos(orbit) * sf.guardRadius
      const targetY = ownerTf.y + Math.sin(orbit) * sf.guardRadius

      if (boid) boid.targetId = -1

      // 直接 lerp 位置跟随主人（确保跟得上）
      const dx = targetX - stf.x
      const dy = targetY - stf.y
      const distToTarget = Math.sqrt(dx * dx + dy * dy)

      if (distToTarget > sf.guardRadius * 3) {
        // 太远 → 高速追赶
        const catchUp = 20
        stf.x += dx * catchUp * dt
        stf.y += dy * catchUp * dt
        stf.vx = dx * catchUp
        stf.vy = dy * catchUp
      } else {
        // 强力 lerp + 速度驱动
        const lerpStrength = 12
        stf.x += dx * lerpStrength * dt
        stf.y += dy * lerpStrength * dt
        stf.vx = dx * lerpStrength
        stf.vy = dy * lerpStrength
      }

      stf.rotation = orbit + Math.PI / 2
    }

    // 自动拦截：检测靠近的敌方弹幕
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

  /** 蜂云绞杀 */
  private _updateAssault(world: World, sf: SwordFormationComponent, dt: number): void {
    const input = world.globals.input as InputState | undefined

    // 目标失效 → 清除
    if (sf.assaultTargetId !== -1 && !world.isAlive(sf.assaultTargetId)) {
      sf.assaultTargetId = -1
      for (const sid of sf.swordIds) {
        const boid = world.getComponent<BoidComponent>(sid, 'Boid')
        if (boid) boid.targetId = -1
      }
    }

    // ── 有锁定目标 → 绞杀攻击 ──
    if (sf.assaultTargetId !== -1) {
      const ttf = world.getComponent<TransformComponent>(sf.assaultTargetId, 'Transform')
      if (!ttf) return
      const now = Date.now()
      const targetHp = world.getComponent<HealthComponent>(sf.assaultTargetId, 'Health')

      for (let i = 0; i < sf.swordIds.length; i++) {
        const sid = sf.swordIds[i]
        if (!world.isAlive(sid)) continue
        const stf = world.getComponent<TransformComponent>(sid, 'Transform')!
        const boid = world.getComponent<BoidComponent>(sid, 'Boid')
        if (boid) boid.targetId = -1 // 接管控制，禁用 Boids 追踪

        const phase = i * 1.618
        const groupIdx = i % 3 // 分三组：穿刺/环绕/游弋

        if (groupIdx === 0) {
          // ── 穿刺组：高速直线穿过目标，穿过后绕回 ──
          const cycleTime = 1.2 + (i % 5) * 0.2
          const t = ((now * 0.001 + phase) % cycleTime) / cycleTime // 0~1
          if (t < 0.4) {
            // 冲刺穿入
            const rushAngle = phase * 2.3 + Math.floor(now * 0.001 / cycleTime) * 1.2
            const startX = ttf.x + Math.cos(rushAngle) * 90
            const startY = ttf.y + Math.sin(rushAngle) * 90
            const endX = ttf.x - Math.cos(rushAngle) * 90
            const endY = ttf.y - Math.sin(rushAngle) * 90
            const p = t / 0.4
            const tx = startX + (endX - startX) * p
            const ty = startY + (endY - startY) * p
            stf.vx = (tx - stf.x) / dt * 0.3
            stf.vy = (ty - stf.y) / dt * 0.3
            stf.x += (tx - stf.x) * 15 * dt
            stf.y += (ty - stf.y) * 15 * dt
            stf.rotation = rushAngle + Math.PI
          } else {
            // 绕回起点
            const rushAngle = phase * 2.3 + Math.floor(now * 0.001 / cycleTime) * 1.2
            const startX = ttf.x + Math.cos(rushAngle) * 90
            const startY = ttf.y + Math.sin(rushAngle) * 90
            stf.x += (startX - stf.x) * 6 * dt
            stf.y += (startY - stf.y) * 6 * dt
            stf.rotation = Math.atan2(startY - stf.y, startX - stf.x)
          }
        } else if (groupIdx === 1) {
          // ── 高速环绕组：紧贴目标旋转切割 ──
          const orbitSpeed = 6 + (i % 4)
          const orbitR = 20 + (i % 3) * 10
          const angle = phase + now * 0.001 * orbitSpeed
          const tx = ttf.x + Math.cos(angle) * orbitR
          const ty = ttf.y + Math.sin(angle) * orbitR
          stf.x += (tx - stf.x) * 12 * dt
          stf.y += (ty - stf.y) * 12 * dt
          stf.vx = (tx - stf.x) * 12
          stf.vy = (ty - stf.y) * 12
          stf.rotation = angle + Math.PI / 2
        } else {
          // ── 游弋组：外圈蜂鸣扰动 + 伺机突入 ──
          const buzz = Math.sin(now * 0.01 + phase * 5) * 30
          const buzzY = Math.cos(now * 0.008 + phase * 3) * 25
          const outerR = 50 + (i % 5) * 8
          const angle = phase + now * 0.001 * 3
          const tx = ttf.x + Math.cos(angle) * outerR + buzz
          const ty = ttf.y + Math.sin(angle) * outerR + buzzY
          stf.x += (tx - stf.x) * 8 * dt
          stf.y += (ty - stf.y) * 8 * dt
          stf.vx = (tx - stf.x) * 8
          stf.vy = (ty - stf.y) * 8
          stf.rotation = Math.atan2(ttf.y - stf.y, ttf.x - stf.x)
        }

        // ── 接触伤害 ──
        if (targetHp) {
          const dx = ttf.x - stf.x
          const dy = ttf.y - stf.y
          if (dx * dx + dy * dy < 18 * 18) {
            targetHp.current = Math.max(0, targetHp.current - 3 * dt * 60)
          }
        }
      }
      return
    }

    // ── 无锁定目标 → 蜂群跟随鼠标 ──
    if (sf.assaultTargetId === -1 && input) {
      const mx = input.mouseX
      const my = input.mouseY
      const now = Date.now()

      for (let i = 0; i < sf.swordIds.length; i++) {
        const sid = sf.swordIds[i]
        if (!world.isAlive(sid)) continue
        const stf = world.getComponent<TransformComponent>(sid, 'Transform')!

        // 每把剑的相位偏移（蜂群不规则运动）
        const phase = i * 1.618 // 黄金比例分布
        const buzz = Math.sin(now * 0.008 + phase * 7) * 35  // 蜂鸣横向扰动
        const buzzY = Math.cos(now * 0.006 + phase * 5) * 25

        // 目标点：鼠标周围快速绕飞
        const orbitAngle = (i / sf.swordIds.length) * Math.PI * 2 + now * 0.005
        const orbitR = 15 + (i % 4) * 8
        const targetX = mx + Math.cos(orbitAngle) * orbitR + buzz
        const targetY = my + Math.sin(orbitAngle) * orbitR + buzzY

        const dx = targetX - stf.x
        const dy = targetY - stf.y
        const dist = Math.sqrt(dx * dx + dy * dy)

        // 速度与祭出一致（远距离平滑飞行，不瞬移）
        const speed = Math.min(8, 2 + dist * 0.01)
        stf.x += dx * speed * dt
        stf.y += dy * speed * dt
        stf.vx = dx * speed
        stf.vy = dy * speed

        // 朝向：始终朝前进方向，增加旋杀感
        const vel = Math.sqrt(stf.vx * stf.vx + stf.vy * stf.vy)
        if (vel > 20) {
          stf.rotation = Math.atan2(stf.vy, stf.vx)
        }
      }
    }
  }

  /** 大庚剑阵 */
  private _updateDomain(world: World, sf: SwordFormationComponent, dt: number): void {
    sf.domainTimer += dt

    const ownerTf = world.getComponent<TransformComponent>(sf.ownerId, 'Transform')
    if (!ownerTf) return

    // 飞剑散开隐入虚空
    for (let i = 0; i < sf.swordIds.length; i++) {
      const sid = sf.swordIds[i]
      if (!world.isAlive(sid)) continue
      const stf = world.getComponent<TransformComponent>(sid, 'Transform')!
      const render = world.getComponent<RenderComponent>(sid, 'Render')

      // 散布到领域边缘
      const angle = (i / sf.swordIds.length) * Math.PI * 2 + sf.domainTimer * 0.3
      const targetX = ownerTf.x + Math.cos(angle) * sf.domainRadius * 0.9
      const targetY = ownerTf.y + Math.sin(angle) * sf.domainRadius * 0.9

      stf.x += (targetX - stf.x) * 2 * dt
      stf.y += (targetY - stf.y) * 2 * dt
      stf.x = Math.max(5, Math.min(this.canvasW - 5, stf.x))
      stf.y = Math.max(5, Math.min(this.canvasH - 5, stf.y))

      // 渐隐
      if (render) render.visible = sf.domainTimer < 0.5 || Math.random() > 0.8
    }

    // 领域效果：剑丝切割
    sf.slashTimer += dt
    if (sf.slashTimer >= sf.slashInterval) {
      sf.slashTimer = 0
      const enemies = world.query(['Transform', 'Health', 'Tag'])
      for (const eid of enemies) {
        const tag = world.getComponent<TagComponent>(eid, 'Tag')!
        if (tag.role !== 'dummy' && tag.role !== 'enemy') continue
        const etf = world.getComponent<TransformComponent>(eid, 'Transform')!
        if (distSq(ownerTf.x, ownerTf.y, etf.x, etf.y) > sf.domainRadius * sf.domainRadius) continue

        const hp = world.getComponent<HealthComponent>(eid, 'Health')!
        hp.current = Math.max(0, hp.current - 8) // 每 0.1s 扣 8 = 80 DPS

        // 禁遁术标记
        world.globals[`no_evasion_${eid}`] = true
      }
    }

    // 领域到期
    if (sf.domainTimer >= sf.domainMaxDuration) {
      this._switchMode(world, sf, 'guardian')
    }

    // 写入 globals 供渲染系统绘制结界
    world.globals.domainCircle = {
      x: ownerTf.x, y: ownerTf.y, radius: sf.domainRadius,
      timer: sf.domainTimer, maxDuration: sf.domainMaxDuration,
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
