import type { System } from '../ecs/types'
import type { World } from '../ecs/World'
import type { TagComponent } from '../components/Tag'
import type { SpiritualityComponent } from '../components/Stats'
import type { CollisionEvent } from './CollisionSystem'

/**
 * 克制关系表
 * key: "攻击方标签 > 防御方标签"
 * value: { multiplier: 伤害倍率, effect: 附加效果 }
 */
const COUNTER_TABLE: Record<string, { multiplier: number; effect: string }> = {
  // 辟邪神雷 vs 魔道
  'lightning>demon':  { multiplier: 3.0,  effect: 'purify' },
  'lightning>ghost':  { multiplier: 2.5,  effect: 'purify' },
  'dao>demon':        { multiplier: 1.8,  effect: 'suppress' },
  'buddhist>ghost':   { multiplier: 2.5,  effect: 'purify' },
  'buddhist>demon':   { multiplier: 2.0,  effect: 'purify' },
  // 五行相克
  'fire>ice':         { multiplier: 1.5,  effect: 'melt' },
  'ice>fire':         { multiplier: 1.5,  effect: 'quench' },
  'water>fire':       { multiplier: 2.0,  effect: 'extinguish' },
  'fire>wind':        { multiplier: 1.3,  effect: 'fan' },
  'earth>lightning':  { multiplier: 1.8,  effect: 'ground' },
  'wind>earth':       { multiplier: 1.5,  effect: 'erode' },
  // 空间/时间系
  'space>flying':     { multiplier: 2.0,  effect: 'lock' },
  'time>swarm':       { multiplier: 1.8,  effect: 'freeze' },
  // 辟邪神雷（青竹蜂云剑专属）
  'evil_warding>demon':  { multiplier: 3.0,  effect: 'purify' },
  'evil_warding>ghost':  { multiplier: 3.0,  effect: 'purify' },
}

/**
 * TagCounterSystem —— 标签克制系统
 *
 * 在碰撞结算之后、帧末之前执行
 * 读取 collisionEvents，根据双方 Tag 查克制表
 * 对被克制方额外扣灵性并写入克制事件
 */
export class TagCounterSystem implements System {
  readonly name = 'TagCounterSystem'

  /** 本帧克制事件（供 UI 读取显示） */
  counterEvents: CounterEvent[] = []

  update(world: World, _dt: number): void {
    this.counterEvents = []

    const events = (world.globals.collisionEvents ?? []) as CollisionEvent[]
    if (events.length === 0) return

    for (const ev of events) {
      const tagA = world.getComponent<TagComponent>(ev.entityA, 'Tag')
      const tagB = world.getComponent<TagComponent>(ev.entityB, 'Tag')
      if (!tagA || !tagB) continue

      // A 攻 B
      this._checkCounter(world, ev.entityA, ev.entityB, tagA, tagB)
      // B 攻 A
      this._checkCounter(world, ev.entityB, ev.entityA, tagB, tagA)
    }

    world.globals.counterEvents = this.counterEvents
  }

  private _checkCounter(
    world: World,
    attackerId: number, defenderId: number,
    attackerTag: TagComponent, defenderTag: TagComponent,
  ): void {
    for (const atk of attackerTag.tags) {
      for (const def of defenderTag.tags) {
        const key = `${atk}>${def}`
        const counter = COUNTER_TABLE[key]
        if (!counter) continue

        // 额外灵性伤害
        const sp = world.getComponent<SpiritualityComponent>(defenderId, 'Spirituality')
        if (sp) {
          const bonus = sp.max * 0.1 * (counter.multiplier - 1)
          sp.current = Math.max(0, sp.current - bonus)
          if (sp.current <= 0) world.destroyEntity(defenderId)
        }

        this.counterEvents.push({
          attacker: attackerId,
          defender: defenderId,
          attackTag: atk,
          defenseTag: def,
          multiplier: counter.multiplier,
          effect: counter.effect,
        })
        return // 每对实体只取第一个匹配的克制关系
      }
    }
  }
}

export interface CounterEvent {
  attacker: number
  defender: number
  attackTag: string
  defenseTag: string
  multiplier: number
  effect: string
}
