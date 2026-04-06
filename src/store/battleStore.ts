import { create } from 'zustand'

export interface BattleState {
  // 玩家状态
  hp: number
  hpMax: number
  mana: number
  manaMax: number
  divineCurrent: number
  divineMax: number
  divineOverloaded: boolean

  // 遁术
  evasionState: string
  evasionCooldown: number

  // 在场法宝
  activeArtifacts: { name: string; state: string; spirituality: number; maxSpirituality: number }[]

  // HUD
  fps: number
  entityCount: number
  timeScale: number

  // 战斗日志
  log: { time: string; msg: string; color: string }[]

  // 操作
  sync: (partial: Partial<BattleState>) => void
  addLog: (msg: string, color?: string) => void
  clearLog: () => void
}

export const useBattleStore = create<BattleState>((set) => ({
  hp: 1000, hpMax: 1000,
  mana: 500, manaMax: 500,
  divineCurrent: 0, divineMax: 100, divineOverloaded: false,
  evasionState: 'ready', evasionCooldown: 0,
  activeArtifacts: [],
  fps: 0, entityCount: 0, timeScale: 1,
  log: [],

  sync: (partial) => set(partial),

  addLog: (msg, color = '#a0b8d0') => set((state) => {
    const now = new Date()
    const time = `${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`
    return { log: [...state.log.slice(-39), { time, msg, color }] }
  }),

  clearLog: () => set({ log: [] }),
}))
