import type { System } from '../ecs/types'
import type { World } from '../ecs/World'
import type { TransformComponent } from '../components/Transform'
import type { DivineSenseComponent } from '../components/DivineSense'
import type { ArtifactInstanceComponent } from '../components/ArtifactInstance'
import { createTransform } from '../components/Transform'
import { createRender } from '../components/Render'
import { createSpirituality } from '../components/Stats'
import { createCircleCollider, LAYER_ARTIFACT, LAYER_ENEMY } from '../components/Collider'
import { createTag } from '../components/Tag'
import { createArtifactInstance } from '../components/ArtifactInstance'
import type { InputState } from './InputSystem'

/** 法宝预设数据（简化版，不走 Zod 注册表，后续接入） */
const SLOT_PRESETS: Record<string, {
  name: string; color: string; glow: string; radius: number
  weight: number; spirituality: number; speed: number; divineCost: number
}> = {
  qinggang_sword:  { name: '青钢剑', color: '#4488ff', glow: '#2244cc', radius: 10, weight: 1.5, spirituality: 200, speed: 450, divineCost: 10 },
  lieyang_bead:    { name: '烈阳珠', color: '#ff6622', glow: '#cc2200', radius: 14, weight: 3.0, spirituality: 400, speed: 320, divineCost: 20 },
  bingxin_needle:  { name: '冰心针', color: '#aaddff', glow: '#88bbee', radius: 7,  weight: 0.3, spirituality: 80,  speed: 900, divineCost: 5  },
  jingang_shield:  { name: '金刚盾', color: '#d4af37', glow: '#aa8820', radius: 20, weight: 12,  spirituality: 1200, speed: 180, divineCost: 30 },
  youming_flag:    { name: '幽冥幡', color: '#8833cc', glow: '#441166', radius: 16, weight: 2.5, spirituality: 350, speed: 280, divineCost: 18 },
}

/**
 * DivineSenseSystem —— 神识管理与法宝祭出/收回
 *
 * 数字键 1~9：祭出/收回对应槽位法宝
 * 法宝默认环绕玩家旋转悬浮
 */
export class DivineSenseSystem implements System {
  readonly name = 'DivineSenseSystem'

  update(world: World, dt: number): void {
    const input = world.globals.input as InputState | undefined
    if (!input) return

    const entities = world.query(['Transform', 'DivineSense'])

    for (const entity of entities) {
      const tf = world.getComponent<TransformComponent>(entity, 'Transform')!
      const ds = world.getComponent<DivineSenseComponent>(entity, 'DivineSense')!

      // ── 过载处理 ──
      if (ds.overloaded) {
        ds.overloadStun -= dt
        if (ds.overloadStun <= 0) {
          ds.overloaded = false
          ds.overloadStun = 0
        }
        continue // 过载中无法操控
      }

      // ── 数字键祭出/收回 ──
      for (let i = 0; i < 9; i++) {
        const key = `Digit${i + 1}`
        if (!input.justPressed.has(key)) continue

        const slotId = ds.slots[i]
        if (!slotId) continue

        // 检查是否已在场
        const existing = ds.activeArtifacts.findIndex(aid => {
          const inst = world.getComponent<ArtifactInstanceComponent>(aid, 'ArtifactInstance')
          return inst && inst.presetId === slotId
        })

        if (existing !== -1) {
          // 收回
          const aid = ds.activeArtifacts[existing]
          const inst = world.getComponent<ArtifactInstanceComponent>(aid, 'ArtifactInstance')
          if (inst) ds.current -= inst.divineCost
          world.destroyEntity(aid)
          ds.activeArtifacts.splice(existing, 1)
        } else {
          // 祭出
          const preset = SLOT_PRESETS[slotId]
          if (!preset) continue

          if (ds.current + preset.divineCost > ds.max) {
            // 过载！
            ds.overloaded = true
            ds.overloadStun = 1.5
            continue
          }

          const aid = this._spawnArtifact(world, entity, slotId, preset, tf)
          ds.activeArtifacts.push(aid)
          ds.current += preset.divineCost
        }
      }

      // ── 环绕更新 ──
      for (const aid of ds.activeArtifacts) {
        if (!world.isAlive(aid)) continue
        const inst = world.getComponent<ArtifactInstanceComponent>(aid, 'ArtifactInstance')
        if (!inst || inst.state !== 'orbiting') continue

        inst.orbitAngle += inst.orbitSpeed * dt
        const atf = world.getComponent<TransformComponent>(aid, 'Transform')!
        atf.x = tf.x + Math.cos(inst.orbitAngle) * inst.orbitRadius
        atf.y = tf.y + Math.sin(inst.orbitAngle) * inst.orbitRadius
        atf.rotation = inst.orbitAngle + Math.PI / 2
      }

      // ── 清理已死亡的法宝 ──
      ds.activeArtifacts = ds.activeArtifacts.filter(aid => {
        if (world.isAlive(aid)) return true
        const inst = world.getComponent<ArtifactInstanceComponent>(aid, 'ArtifactInstance')
        if (inst) ds.current -= inst.divineCost
        return false
      })
    }
  }

  private _spawnArtifact(
    world: World,
    ownerId: number,
    presetId: string,
    preset: typeof SLOT_PRESETS[string],
    ownerTf: TransformComponent,
  ): number {
    const entity = world.createEntity()
    const tf = createTransform(ownerTf.x, ownerTf.y - 50)
    const render = createRender(preset.radius, preset.color, preset.name)
    render.glowColor = preset.glow

    world
      .addComponent(entity, tf)
      .addComponent(entity, render)
      .addComponent(entity, createSpirituality(preset.spirituality))
      .addComponent(entity, createCircleCollider(preset.radius, preset.weight, {
        layer: LAYER_ARTIFACT,
        mask: LAYER_ARTIFACT | LAYER_ENEMY,
      }))
      .addComponent(entity, createTag('artifact', ['dao']))
      .addComponent(entity, createArtifactInstance(ownerId, presetId, {
        divineCost: preset.divineCost,
      }))

    return entity
  }
}
