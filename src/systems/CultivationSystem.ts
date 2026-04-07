import type { System } from '../ecs/types'
import type { World } from '../ecs/World'
import type { CultivationComponent, HeavyOriginComponent } from '../components/Cultivation'
import type { ManaComponent } from '../components/Stats'
import type { TransformComponent } from '../components/Transform'
import type { SwordFormationComponent } from '../components/SwordFormation'
import { applyPrestige } from '../components/Cultivation'
import { createTransform } from '../components/Transform'
import { createRender } from '../components/Render'
import { createTrail } from '../components/SwordFormation'
import { createTag } from '../components/Tag'
import { createCircleCollider, LAYER_ARTIFACT, LAYER_ENEMY } from '../components/Collider'
import { createBoid } from '../components/Boid'
import type { InputState } from './InputSystem'

/**
 * CultivationSystem —— 功法修炼系统
 *
 * - 修为积累与等级提升
 * - 被动效果激活（青元剑芒真伤）
 * - 主动技能触发（护盾/分光/剑阵）
 * - 三转重元功散功重修
 * - 真元碾压判定
 */
export class CultivationSystem implements System {
  readonly name = 'CultivationSystem'

  update(world: World, dt: number): void {
    const input = world.globals.input as InputState | undefined
    const entities = world.query(['Cultivation'])

    for (const entity of entities) {
      const cult = world.getComponent<CultivationComponent>(entity, 'Cultivation')!
      const ho = world.getComponent<HeavyOriginComponent>(entity, 'HeavyOrigin')

      // ── 技能冷却 tick ──
      for (const key of Object.keys(cult.skillCooldowns)) {
        if (cult.skillCooldowns[key] > 0) {
          cult.skillCooldowns[key] -= dt
          if (cult.skillCooldowns[key] <= 0) delete cult.skillCooldowns[key]
        }
      }

      // ── 法力倍率应用（三转重元功）──
      if (ho) {
        const mana = world.getComponent<ManaComponent>(entity, 'Mana')
        if (mana) {
          mana.max = Math.round(500 * ho.manaMultiplier) // 基础500 × 倍率
        }
      }

      // ── 散功判定 ──
      if (ho) {
        ho.canPrestige = cult.level >= this._getTierMaxLevel(cult.tier) && ho.turnCount < 3
      }

      // ── 被动：青元剑芒（提升飞剑伤害）──
      if (cult.unlockedSkills.includes('sword_gleam')) {
        // 写入全局被动倍率，供 SwordFormationSystem._swordContactDamage 读取
        world.globals._swordGleamBonus = 1 + 0.03 * cult.level // Lv10 = 1.3x
      }

      // ── 护盾 tick ──
      const shieldKey = `shield_${entity}`
      const shieldTime = (world.globals[shieldKey] ?? 0) as number
      if (shieldTime > 0) {
        world.globals[shieldKey] = shieldTime - dt
        // 护盾期间：扩大护体半径
        const sf = this._getFormation(world, entity)
        if (sf) sf.guardRadius = 85
      } else {
        const sf = this._getFormation(world, entity)
        if (sf && sf.guardRadius > 55) sf.guardRadius = 55
      }

      // ── 大庚剑阵自动分光 ──
      if (world.globals._domainAutoSplit && !world.globals._splitActive) {
        this.doAutoSplit(world, entity)
        world.globals._domainAutoSplit = false
      }

      // ── 主动技能检测 ──
      if (!input) continue

      // V键：分光剑影诀（切换：分光/收回，护体模式禁用）
      if (input.justPressed.has('KeyV') && cult.unlockedSkills.includes('shadow_split')) {
        const sf = this._getFormation(world, entity)
        if (sf && sf.mode === 'guardian') {
          // 护体模式不可分光
        } else if (world.globals._splitActive) {
          this.unsplit(world, entity)
        } else {
          this._castShadowSplit(world, entity, cult, input)
        }
      }

      // B键：护体剑盾（扩大护体圈 + 反弹来袭）
      if (input.justPressed.has('KeyB') && cult.unlockedSkills.includes('sword_shield')) {
        this._castSwordShield(world, entity, cult)
      }
    }
  }

  /** 获取玩家的剑阵 */
  private _getFormation(world: World, ownerId: number): SwordFormationComponent | null {
    const formations = world.query(['SwordFormation'])
    for (const fid of formations) {
      const sf = world.getComponent<SwordFormationComponent>(fid, 'SwordFormation')
      if (sf && sf.ownerId === ownerId) return sf
    }
    return null
  }

  /** 散功重修 API（供 UI 调用） */
  prestige(world: World, entityId: number): boolean {
    const cult = world.getComponent<CultivationComponent>(entityId, 'Cultivation')
    const ho = world.getComponent<HeavyOriginComponent>(entityId, 'HeavyOrigin')
    if (!cult || !ho || !ho.canPrestige) return false

    if (!applyPrestige(ho)) return false

    // 重置修为与等级
    cult.level = 1
    cult.exp = 0
    cult.expToNext = 100
    cult.tier = 'qi'
    cult.unlockedSkills = ['sword_gleam']

    return true
  }

  /** 增加修为 API */
  addExp(world: World, entityId: number, amount: number): void {
    const cult = world.getComponent<CultivationComponent>(entityId, 'Cultivation')
    if (!cult || cult.level >= 13) return

    cult.exp += amount
    while (cult.exp >= cult.expToNext && cult.level < 13) {
      cult.exp -= cult.expToNext
      cult.level++
      cult.expToNext = 100 * cult.level
      cult.tier = cult.level <= 3 ? 'qi' : cult.level <= 6 ? 'foundation' : cult.level <= 9 ? 'core' : 'nascent'

      // 解锁新技能
      if (cult.level === 4 && !cult.unlockedSkills.includes('sword_shield'))
        cult.unlockedSkills.push('sword_shield')
      if (cult.level === 7 && !cult.unlockedSkills.includes('shadow_split'))
        cult.unlockedSkills.push('shadow_split')
      if (cult.level === 10 && !cult.unlockedSkills.includes('dageng_array'))
        cult.unlockedSkills.push('dageng_array')
    }
  }

  /** 检查大庚剑阵是否可用 */
  canUseDagengArray(world: World, entityId: number): boolean {
    const cult = world.getComponent<CultivationComponent>(entityId, 'Cultivation')
    if (!cult || !cult.unlockedSkills.includes('dageng_array')) return false

    // 需要青竹蜂云剑已祭出
    const formations = world.query(['SwordFormation'])
    for (const fid of formations) {
      const sf = world.getComponent<SwordFormationComponent>(fid, 'SwordFormation')
      if (sf && sf.ownerId === entityId) return true
    }
    return false
  }

  /** 真元碾压判定 */
  calcDensityCrush(
    attackerDensity: number, defenderDensity: number,
  ): { multiplier: number; stun: number } {
    if (attackerDensity > defenderDensity * 2) {
      return { multiplier: 1.5, stun: 0.5 }
    }
    if (attackerDensity > defenderDensity * 1.5) {
      return { multiplier: 1.2, stun: 0.2 }
    }
    return { multiplier: 1, stun: 0 }
  }

  // ── 内部 ──

  private _getTierMaxLevel(tier: string): number {
    switch (tier) {
      case 'qi': return 3
      case 'foundation': return 6
      case 'core': return 9
      case 'nascent': return 13
      default: return 13
    }
  }

  /** 分光剑影诀：每把飞剑原地分裂为 N 把剑丝分身，伤害=80%/N */
  private _castShadowSplit(
    world: World, entity: number,
    cult: CultivationComponent, _input: InputState,
  ): void {
    if (cult.skillCooldowns['shadow_split']) return
    const sf = this._getFormation(world, entity)
    if (!sf || sf.swordIds.length === 0) return
    if (world.globals._splitActive) return // 已分光

    const aliveSwords = sf.swordIds.filter(sid => world.isAlive(sid))
    if (aliveSwords.length === 0) return

    const manaCostRatio = 0.05 + aliveSwords.length * 0.005
    const mana = world.getComponent<ManaComponent>(entity, 'Mana')
    if (mana && mana.current < mana.max * manaCostRatio) return
    if (mana) mana.current -= mana.max * manaCostRatio

    cult.skillCooldowns['shadow_split'] = 8
    const splits = (world.globals._splitCountSetting ?? 3) as number
    this._doSplit(world, sf, aliveSwords, splits)
  }

  /** 执行分光（供技能和剑阵自动调用） */
  doAutoSplit(world: World, entityId: number, splitsPerSword = 3): void {
    if (world.globals._splitActive) return
    const sf = this._getFormation(world, entityId)
    if (!sf) return
    const alive = sf.swordIds.filter(sid => world.isAlive(sid))
    if (alive.length === 0) return
    this._doSplit(world, sf, alive, splitsPerSword)
  }

  private _doSplit(world: World, sf: SwordFormationComponent, aliveSwords: number[], splitsPerSword: number): void {
    const guardCount = Math.round(aliveSwords.length * sf.guardRatio)
    const attackSwords = aliveSwords.slice(guardCount)
    if (attackSwords.length === 0) return

    const newIds: number[] = []
    const parentMap: Record<string, number> = {}

    for (const sid of attackSwords) {
      const stf = world.getComponent<TransformComponent>(sid, 'Transform')!
      // 原剑也标记为分光状态（变虚）
      world.globals[`_splitSword_${sid}`] = true
      for (let j = 0; j < splitsPerSword; j++) {
        const a = (j / splitsPerSword) * Math.PI * 2 + Math.random() * 0.3
        const d = 6 + Math.random() * 5
        const clone = world.createEntity()
        const ctf = createTransform(stf.x + Math.cos(a) * d, stf.y + Math.sin(a) * d)
        ctf.vx = stf.vx; ctf.vy = stf.vy; ctf.rotation = stf.rotation

        const render = createRender(3, '#d4af3766')
        render.glowColor = '#aa882033'

        world
          .addComponent(clone, ctf)
          .addComponent(clone, render)
          .addComponent(clone, createCircleCollider(3, 0.05, { layer: LAYER_ARTIFACT, mask: LAYER_ENEMY }))
          .addComponent(clone, createTag('artifact', ['wood', 'lightning', 'evil_warding']))
          .addComponent(clone, createTrail('#d4af3722', 1, 4))
          .addComponent(clone, createBoid('qingzhu_72', {
            separationWeight: 4.0, alignmentWeight: 1.0, cohesionWeight: 0.8,
            maxSpeed: 350, maxForce: 500, perceptionRadius: 60, separationRadius: 25,
            targetId: -1, seekWeight: 2.5,
          }))
        world.globals[`_splitSword_${clone}`] = true
        parentMap[String(clone)] = sid
        newIds.push(clone)
      }
    }

    sf.swordIds.push(...newIds)
    sf.swordCount = sf.swordIds.length
    world.globals._splitActive = true
    world.globals._splitCount = splitsPerSword + 1
    world.globals._splitCloneIds = newIds
    world.globals._splitParentMap = parentMap
    world.globals._swordDmgMultiplier = 0.8 / (1 + splitsPerSword)
  }

  /** 收回分光（合并动画：分身飞回原剑后销毁） */
  unsplit(world: World, entityId: number): void {
    if (!world.globals._splitActive) return
    const sf = this._getFormation(world, entityId)
    if (!sf) return
    const cloneIds = (world.globals._splitCloneIds ?? []) as number[]
    const parentMap = (world.globals._splitParentMap ?? {}) as Record<string, number>

    // 标记为合并中（飞回原剑）
    const merging = (world.globals._mergingSwords ?? []) as { id: number; targetId: number }[]
    const parentIds = new Set<number>()
    for (const cid of cloneIds) {
      if (!world.isAlive(cid)) continue
      const parentId = parentMap[String(cid)] ?? -1
      if (parentId !== -1 && world.isAlive(parentId)) {
        merging.push({ id: cid, targetId: parentId })
        parentIds.add(parentId)
      } else {
        world.destroyEntity(cid)
      }
      delete world.globals[`_splitSword_${cid}`]
    }
    // 恢复原剑为实体
    for (const pid of parentIds) {
      delete world.globals[`_splitSword_${pid}`]
    }
    world.globals._mergingSwords = merging

    sf.swordIds = sf.swordIds.filter(sid => world.isAlive(sid) && !cloneIds.includes(sid))
    sf.swordCount = sf.swordIds.length
    world.globals._splitActive = false
    world.globals._splitCount = 1
    world.globals._splitCloneIds = []
    world.globals._splitParentMap = {}
    world.globals._swordDmgMultiplier = 1
  }

  /** 护体剑盾：扩大护体圈 + 飞剑高速旋转反弹 */
  private _castSwordShield(
    world: World, entity: number, cult: CultivationComponent,
  ): void {
    if (cult.skillCooldowns['sword_shield']) return
    const sf = this._getFormation(world, entity)
    if (!sf) return

    const mana = world.getComponent<ManaComponent>(entity, 'Mana')
    if (mana && mana.current < mana.max * 0.15) return
    if (mana) mana.current -= mana.max * 0.15

    cult.skillCooldowns['sword_shield'] = 10

    // 标记护盾状态 5 秒（_updateGuardian 和 tick 处理会用到）
    world.globals[`shield_${entity}`] = 5.0

    // 强制切换到护体模式，并临时提升 guardRatio
    sf.guardRatio = 1.0
  }
}
