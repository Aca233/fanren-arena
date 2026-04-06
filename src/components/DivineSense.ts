import type { Component } from '../ecs/types'

/**
 * 神识组件 —— 修仙者操控法宝的"精神带宽"
 *
 * 每个在场法宝占用一定神识值，超过上限触发过载僵直
 */
export interface DivineSenseComponent extends Component {
  readonly type: 'DivineSense'
  /** 当前已消耗神识 */
  current: number
  /** 神识上限 */
  max: number
  /** 神识恢复速率（/秒，仅当没有过载时恢复已回收的部分） */
  regenPerSec: number
  /** 是否过载（超过上限） */
  overloaded: boolean
  /** 过载僵直剩余时间（秒） */
  overloadStun: number
  /** 当前在场法宝实体 ID 列表 */
  activeArtifacts: number[]
  /** 法宝槽位绑定（按键 1~9 对应的法宝预设 ID） */
  slots: (string | null)[]
}

export function createDivineSense(
  max: number,
  slots: (string | null)[] = [],
): DivineSenseComponent {
  return {
    type: 'DivineSense',
    current: 0,
    max,
    regenPerSec: 8,
    overloaded: false,
    overloadStun: 0,
    activeArtifacts: [],
    slots: [...slots, ...Array(9 - slots.length).fill(null)].slice(0, 9),
  }
}
