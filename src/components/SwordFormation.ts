import type { Component } from '../ecs/types'

export type FormationMode = 'guardian' | 'assault' | 'domain'
export type DomainPhase = 'none' | 'deploying' | 'active' | 'collapsing'

/**
 * SwordFormation 组件 —— 青竹蜂云剑集群控制器
 *
 * 三种形态：
 *   guardian — 游鱼护体（防御环绕+自动拦截）
 *   assault  — 蜂云绞杀（Boids追踪+水滴石穿）
 *   domain   — 大庚剑阵（三阶段：布阵→绞杀→收阵/破阵）
 */
export interface SwordFormationComponent extends Component {
  readonly type: 'SwordFormation'
  ownerId: number
  mode: FormationMode
  switchCooldown: number
  switchCooldownMax: number
  swordIds: number[]
  swordCount: number
  guardRadius: number
  /** 护体比例 0~1（其余剑投入攻击/剑阵） */
  guardRatio: number
  assaultTargetId: number

  // ── 大庚剑阵 ──
  domainRadius: number
  domainPhase: DomainPhase
  domainTimer: number
  /** 阵心固定坐标（展开时锁定，不跟随角色） */
  domainCenterX: number
  domainCenterY: number
  /** 布阵时间（无敌帧） */
  deployDuration: number
  /** 绞杀持续时间 */
  activeDuration: number
  /** 收阵/崩溃动画时间 */
  collapseDuration: number
  /** 阵眼生命值 */
  coreHealth: number
  coreHealthMax: number
  /** 剑丝切割 */
  slashTimer: number
  slashInterval: number
  slashDamage: number
  /** 当前帧的剑丝线段（供渲染用） */
  swordSilks: { x1: number; y1: number; x2: number; y2: number; alpha: number }[]
  /** 减速倍率 */
  slowMultiplier: number
  /** 是否被强行破阵 */
  broken: boolean

  // ── 消耗 ──
  divineDrainPerSec: number
  domainDivineDrain: number
  /** domain 初始法力消耗比例 */
  domainManaCost: number

  // ── 环境暗化 */
  darkenAlpha: number
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
    guardRatio: 1.0,
    assaultTargetId: -1,
    domainRadius: 250,
    domainPhase: 'none',
    domainTimer: 0,
    domainCenterX: 0,
    domainCenterY: 0,
    deployDuration: 1.5,
    activeDuration: 15,
    collapseDuration: 1.0,
    coreHealth: 5000,
    coreHealthMax: 5000,
    slashTimer: 0,
    slashInterval: 0.1,
    slashDamage: 50,
    swordSilks: [],
    slowMultiplier: 0.4,
    broken: false,
    divineDrainPerSec: 2,
    domainDivineDrain: 8,
    domainManaCost: 0.5,
    darkenAlpha: 0,
  }
}

/** 单剑拖尾组件 */
export interface TrailComponent extends Component {
  readonly type: 'Trail'
  positions: { x: number; y: number }[]
  maxLength: number
  color: string
  width: number
}

export function createTrail(color = '#d4af3766', width = 2, maxLength = 8): TrailComponent {
  return { type: 'Trail', positions: [], maxLength, color, width }
}
