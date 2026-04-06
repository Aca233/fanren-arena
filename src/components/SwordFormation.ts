import type { Component } from '../ecs/types'

export type FormationMode = 'guardian' | 'assault' | 'domain'

/**
 * SwordFormation 组件 —— 青竹蜂云剑集群控制器
 *
 * 挂载在"剑阵主控实体"上，管理 72 把飞剑子实体
 * 三种形态：
 *   guardian — 游鱼护体（防御环绕+自动拦截）
 *   assault  — 蜂云绞杀（Boids追踪+水滴石穿）
 *   domain   — 大庚剑阵（领域结界+剑丝切割+禁遁）
 */
export interface SwordFormationComponent extends Component {
  readonly type: 'SwordFormation'
  /** 主人实体 ID */
  ownerId: number
  /** 当前形态 */
  mode: FormationMode
  /** 形态切换冷却（秒） */
  switchCooldown: number
  switchCooldownMax: number
  /** 剑阵子实体 ID 列表 */
  swordIds: number[]
  /** 剑阵总数 */
  swordCount: number
  /** 防御圈半径（guardian 模式） */
  guardRadius: number
  /** 追踪目标 ID（assault 模式） */
  assaultTargetId: number
  /** 领域半径（domain 模式） */
  domainRadius: number
  /** 领域激活状态 */
  domainActive: boolean
  /** 领域存续时间 */
  domainTimer: number
  domainMaxDuration: number
  /** 剑丝切割定时器 */
  slashTimer: number
  slashInterval: number
  /** 神识消耗（每秒） */
  divineDrainPerSec: number
  /** 领域额外神识消耗 */
  domainDivineDrain: number
}

export function createSwordFormation(ownerId: number): SwordFormationComponent {
  return {
    type: 'SwordFormation',
    ownerId,
    mode: 'guardian',
    switchCooldown: 0,
    switchCooldownMax: 1.5,
    swordIds: [],
    swordCount: 72,
    guardRadius: 55,
    assaultTargetId: -1,
    domainRadius: 220,
    domainActive: false,
    domainTimer: 0,
    domainMaxDuration: 8,
    slashTimer: 0,
    slashInterval: 0.1,
    divineDrainPerSec: 2,
    domainDivineDrain: 8,
  }
}

/** 单剑拖尾组件 */
export interface TrailComponent extends Component {
  readonly type: 'Trail'
  /** 历史位置记录（最多 8 帧） */
  positions: { x: number; y: number }[]
  maxLength: number
  color: string
  width: number
}

export function createTrail(color = '#d4af3766', width = 2, maxLength = 8): TrailComponent {
  return { type: 'Trail', positions: [], maxLength, color, width }
}
