import type { Entity } from '../ecs/types'
import type { World } from '../ecs/World'
import type { ArtifactData } from '../schemas/ArtifactSchema'
import { createTransform } from '../components/Transform'
import { createRender } from '../components/Render'
import { createSpirituality } from '../components/Stats'
import { createCircleCollider, LAYER_ARTIFACT, LAYER_ENEMY } from '../components/Collider'
import { createTag } from '../components/Tag'
import { createArtifactInstance } from '../components/ArtifactInstance'

/**
 * ArtifactFactory —— 第一层：基础组件拼装
 *
 * 读取 ArtifactData（已经过 Zod 校验），自动组装 ECS 组件
 * 覆盖 80% 的常规法宝（巨剑、飞针、重盾等），无需特殊逻辑
 */
export function spawnArtifactFromData(
  world: World,
  data: ArtifactData,
  ownerId: Entity,
  x: number,
  y: number,
): Entity {
  const entity = world.createEntity()

  // Transform
  const tf = createTransform(x, y)
  world.addComponent(entity, tf)

  // Render
  const render = createRender(data.radius, data.color, data.name)
  render.glowColor = data.color + '88'
  world.addComponent(entity, render)

  // Spirituality（法宝生命值）
  world.addComponent(entity, createSpirituality(data.spirituality))

  // Collider
  world.addComponent(entity, createCircleCollider(data.radius, data.weight, {
    layer: LAYER_ARTIFACT,
    mask: LAYER_ARTIFACT | LAYER_ENEMY,
  }))

  // Tag（从 ArtifactData.tags 转为 Set）
  world.addComponent(entity, createTag('artifact', data.tags))

  // ArtifactInstance（绑定主人）
  const divineCost = Math.ceil(data.weight * 3 + data.spirituality / 100)
  world.addComponent(entity, createArtifactInstance(ownerId, data.id, {
    divineCost,
    orbitSpeed: Math.max(0.8, 3.0 - data.weight * 0.1),
  }))

  // ── 第二层：挂载 Behavior 组件（若有）──
  if (data.behaviors && data.behaviors.length > 0) {
    world.addComponent(entity, {
      type: 'BehaviorSet',
      behaviors: data.behaviors.map(b => ({
        trigger: b.trigger,
        triggerValue: b.triggerValue ?? 0,
        action: b.action,
        actionParams: b.actionParams ?? {},
        cooldown: 0,
        cooldownMax: b.trigger === 'onInterval' ? (b.triggerValue ?? 1) : 0.5,
      })),
    })
  }

  // ── 第三层：挂载 Aura 组件（若有）──
  if (data.aura) {
    world.addComponent(entity, {
      type: 'Aura',
      radius: data.aura.radius,
      effect: data.aura.effect,
      strength: data.aura.strength,
      affectsTags: data.aura.affectsTags ?? null,
    })
  }

  // ── 第四层：挂载 Script 组件（若有）──
  if (data.scripts && data.scripts.length > 0) {
    world.addComponent(entity, {
      type: 'ScriptSet',
      hooks: data.scripts.map(s => ({
        event: s.event,
        code: s.code,
        compiled: null, // 由 ScriptSystem 懒编译
      })),
    })
  }

  return entity
}

/**
 * 批量生成法宝实体
 */
export function spawnArtifactBatch(
  world: World,
  dataList: ArtifactData[],
  ownerId: Entity,
  cx: number, cy: number,
): Entity[] {
  return dataList.map((data, i) => {
    const angle = (i / dataList.length) * Math.PI * 2
    const x = cx + Math.cos(angle) * 80
    const y = cy + Math.sin(angle) * 80
    return spawnArtifactFromData(world, data, ownerId, x, y)
  })
}
