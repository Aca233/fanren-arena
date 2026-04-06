import type { Component } from '../ecs/types'

/** 生命值组件 */
export interface HealthComponent extends Component {
  readonly type: 'Health'
  current: number
  max: number
}

export function createHealth(max: number): HealthComponent {
  return { type: 'Health', current: max, max }
}

/** 法力值组件 */
export interface ManaComponent extends Component {
  readonly type: 'Mana'
  current: number
  max: number
  regenPerSec: number
}

export function createMana(max: number, regenPerSec = 10): ManaComponent {
  return { type: 'Mana', current: max, max, regenPerSec }
}

/** 灵性组件（法宝专用） */
export interface SpiritualityComponent extends Component {
  readonly type: 'Spirituality'
  current: number
  max: number
}

export function createSpirituality(max: number): SpiritualityComponent {
  return { type: 'Spirituality', current: max, max }
}
