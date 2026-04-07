import type { Component } from '../ecs/types'

// ──────────────────────────────────────────────
// 功法修炼组件
// ──────────────────────────────────────────────

export type CultivationTier = 'none' | 'qi' | 'foundation' | 'core' | 'nascent' | 'deity'

export interface CultivationComponent extends Component {
  readonly type: 'Cultivation'
  /** 当前修炼的功法 ID */
  artId: string
  /** 功法等级 (1~13) */
  level: number
  /** 当前修为（经验值） */
  exp: number
  /** 升级所需修为 */
  expToNext: number
  /** 当前境界 */
  tier: CultivationTier
  /** 已解锁的主动技能 */
  unlockedSkills: string[]
  /** 技能冷却表 */
  skillCooldowns: Record<string, number>
}

export function createCultivation(artId: string, level = 1): CultivationComponent {
  return {
    type: 'Cultivation',
    artId,
    level,
    exp: 0,
    expToNext: 100 * level,
    tier: level <= 3 ? 'qi' : level <= 6 ? 'foundation' : level <= 9 ? 'core' : 'nascent',
    unlockedSkills: getSkillsForLevel(artId, level),
    skillCooldowns: {},
  }
}

function getSkillsForLevel(artId: string, level: number): string[] {
  if (artId !== 'qingyuan_sword_art') return []
  const skills: string[] = []
  if (level >= 1) skills.push('sword_gleam')      // 青元剑芒
  if (level >= 4) skills.push('sword_shield')      // 护体剑盾
  if (level >= 7) skills.push('shadow_split')      // 剑影分光术
  if (level >= 10) skills.push('dageng_array')     // 大庚剑阵
  return skills
}

// ──────────────────────────────────────────────
// 三转重元功
// ──────────────────────────────────────────────

export interface HeavyOriginComponent extends Component {
  readonly type: 'HeavyOrigin'
  /** 当前转数 (0~3) */
  turnCount: number
  /** 法力上限倍率 */
  manaMultiplier: number
  /** 真元密度（影响碾压判定） */
  manaDensity: number
  /** 是否可以散功（达到当前境界巅峰） */
  canPrestige: boolean
}

const TURN_BONUSES = [
  { manaMultiplier: 1.0, density: 1.0 },
  { manaMultiplier: 2.0, density: 1.5 },
  { manaMultiplier: 4.0, density: 2.5 },
  { manaMultiplier: 8.0, density: 4.0 },
]

export function createHeavyOrigin(): HeavyOriginComponent {
  return {
    type: 'HeavyOrigin',
    turnCount: 0,
    manaMultiplier: 1.0,
    manaDensity: 1.0,
    canPrestige: false,
  }
}

export function applyPrestige(ho: HeavyOriginComponent): boolean {
  if (ho.turnCount >= 3) return false
  ho.turnCount++
  const bonus = TURN_BONUSES[ho.turnCount]
  ho.manaMultiplier = bonus.manaMultiplier
  ho.manaDensity = bonus.density
  ho.canPrestige = false
  return true
}

// ──────────────────────────────────────────────
// 功法被动效果组件
// ──────────────────────────────────────────────

export interface SwordGleamPassive extends Component {
  readonly type: 'SwordGleamPassive'
  /** 命中时附加真伤比例 */
  damageRatio: number
}

export function createSwordGleamPassive(level: number): SwordGleamPassive {
  return { type: 'SwordGleamPassive', damageRatio: 0.02 * level }
}
