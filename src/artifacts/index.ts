import { loadArtifactBatch, type ArtifactData } from '../schemas/ArtifactSchema'
import starterRaw from './data/starter-artifacts.json'

/** 已加载并验证的法宝配置表 */
let _registry: Map<string, ArtifactData> | null = null

function buildRegistry(): Map<string, ArtifactData> {
  const artifacts = loadArtifactBatch(starterRaw)
  const map = new Map<string, ArtifactData>()
  for (const a of artifacts) {
    if (map.has(a.id)) {
      console.warn(`[ArtifactRegistry] 重复 ID：${a.id}，后者覆盖前者`)
    }
    map.set(a.id, a)
  }
  return map
}

/** 获取法宝注册表（懒加载，首次调用时校验所有数据） */
export function getRegistry(): ReadonlyMap<string, ArtifactData> {
  if (!_registry) _registry = buildRegistry()
  return _registry
}

/** 按 ID 获取法宝数据（不存在则抛出） */
export function getArtifact(id: string): ArtifactData {
  const reg = getRegistry()
  const artifact = reg.get(id)
  if (!artifact) throw new Error(`[ArtifactRegistry] 未知法宝 ID：${id}`)
  return artifact
}

/** 获取所有已注册法宝 */
export function getAllArtifacts(): ArtifactData[] {
  return Array.from(getRegistry().values())
}
