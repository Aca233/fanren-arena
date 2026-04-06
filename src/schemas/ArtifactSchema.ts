import { z } from 'zod'

// ──────────────────────────────────────────────
// 枚举定义
// ──────────────────────────────────────────────

export const ArtifactTierSchema = z.enum(['low', 'mid', 'high', 'supreme', 'immortal'])
export type ArtifactTier = z.infer<typeof ArtifactTierSchema>

export const ArtifactTagSchema = z.enum([
  // 属性系
  'fire', 'water', 'earth', 'wind', 'lightning', 'ice',
  // 道魔系
  'dao', 'demon', 'ghost', 'buddhist',
  // 形态系
  'sword', 'shield', 'needle', 'whip', 'flag', 'cauldron', 'bead',
  // 特性系
  'flying', 'swarm', 'domain', 'time', 'space',
])
export type ArtifactTag = z.infer<typeof ArtifactTagSchema>

// ──────────────────────────────────────────────
// 第二层：触发器与行为
// ──────────────────────────────────────────────

export const TriggerTypeSchema = z.enum([
  'onHit',       // 命中目标时
  'onDistance',  // 靠近目标时
  'onSpawn',     // 祭出时
  'onDestroy',   // 被击毁时
  'onInterval',  // 每隔 N 秒
])

export const ActionTypeSchema = z.enum([
  'Spawn',        // 分裂/召唤子实体
  'ApplyBuff',    // 挂载状态效果
  'Explode',      // 爆炸范围伤害
  'Absorb',       // 吸收附近实体
  'Teleport',     // 传送
])

export const BehaviorSchema = z.object({
  trigger: TriggerTypeSchema,
  triggerValue: z.number().optional(),  // onDistance 的距离阈值 / onInterval 的间隔秒数
  action: ActionTypeSchema,
  actionParams: z.record(z.unknown()).optional(),
})
export type Behavior = z.infer<typeof BehaviorSchema>

// ──────────────────────────────────────────────
// 第三层：领域与光环
// ──────────────────────────────────────────────

export const AuraEffectSchema = z.enum([
  'gravity',      // 引力（将实体拉向中心）
  'repulsion',    // 斥力（将实体推离中心）
  'slow',         // 减速区域
  'blind',        // 致盲（遮蔽神识）
  'confiscate',   // 没收（吞噬靠近的法宝）
  'damage',       // 持续伤害区域
])

export const AuraSchema = z.object({
  radius: z.number().positive(),
  effect: AuraEffectSchema,
  strength: z.number().min(0).max(10),
  affectsTags: z.array(ArtifactTagSchema).optional(), // 为空则影响全部
})
export type Aura = z.infer<typeof AuraSchema>

// ──────────────────────────────────────────────
// 第四层：脚本化事件钩子
// ──────────────────────────────────────────────

export const ScriptHookSchema = z.object({
  event: z.enum(['onSpawn', 'onUpdate', 'onHit', 'onDestroy']),
  // 极简 JS 表达式字符串，注入上下文：{ entity, world, dt, target }
  // 例："world.setTimeScale(0.2)"
  code: z.string().max(512),
})
export type ScriptHook = z.infer<typeof ScriptHookSchema>

// ──────────────────────────────────────────────
// 核心：法宝数据模板
// ──────────────────────────────────────────────

export const ArtifactSchema = z.object({
  /** 全局唯一 ID，用于数据索引 */
  id: z.string().min(1).regex(/^[a-z0-9_-]+$/, '只允许小写字母、数字、下划线、连字符'),

  /** 法宝中文名 */
  name: z.string().min(1).max(20),

  /** 品阶 */
  tier: ArtifactTierSchema,

  /** 标签（至少一个） */
  tags: z.array(ArtifactTagSchema).min(1),

  // ── 基础数值 ──
  /** 重量（决定碰撞结算：弹开/角力/碾压），单位：石，范围 0.1~100 */
  weight: z.number().min(0.1).max(100),

  /** 初始灵性（法宝"生命值"），范围 1~10000 */
  spirituality: z.number().int().min(1).max(10_000),

  /** 飞行速度，单位：像素/秒，范围 50~2000 */
  speed: z.number().min(50).max(2000),

  /** 碰撞体半径，单位：像素 */
  radius: z.number().min(4).max(200),

  /** 对角色的接触伤害（每秒），0 表示无接触伤害 */
  contactDamage: z.number().min(0).default(0),

  // ── 扩展层（可选）──
  /** 第二层：触发行为列表 */
  behaviors: z.array(BehaviorSchema).optional(),

  /** 第三层：领域光环 */
  aura: AuraSchema.optional(),

  /** 第四层：脚本钩子 */
  scripts: z.array(ScriptHookSchema).optional(),

  /** 显示颜色（CSS 色值，用于 Canvas 渲染） */
  color: z.string().default('#d4af37'),

  /** 图标 emoji（用于快捷栏显示） */
  icon: z.string().default('⚔️'),
})

export type ArtifactData = z.infer<typeof ArtifactSchema>

// ──────────────────────────────────────────────
// 工具函数：加载并校验法宝配置
// ──────────────────────────────────────────────

export function loadArtifact(raw: unknown): ArtifactData {
  const result = ArtifactSchema.safeParse(raw)
  if (!result.success) {
    const issues = result.error.issues
      .map(i => `  [${i.path.join('.')}] ${i.message}`)
      .join('\n')
    throw new Error(`法宝数据校验失败：\n${issues}`)
  }
  return result.data
}

export function loadArtifactBatch(raws: unknown[]): ArtifactData[] {
  return raws.map((raw, i) => {
    try {
      return loadArtifact(raw)
    } catch (e) {
      throw new Error(`第 ${i} 条法宝数据错误：${(e as Error).message}`)
    }
  })
}
