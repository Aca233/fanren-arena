/**
 * 空间哈希 —— O(1) 碰撞候选查询
 *
 * 将画布划分为 cellSize×cellSize 的网格
 * 每帧重建，insert O(N)，query 只查周围 9 格
 */
export class SpatialHash {
  private readonly cellSize: number
  private readonly cells = new Map<number, number[]>()
  private readonly cols: number

  constructor(width: number, height: number, cellSize = 60) {
    this.cellSize = cellSize
    this.cols = Math.ceil(width / cellSize)
    void height // hash key uses cols only
  }

  /** 清空并重建（每帧调用） */
  clear(): void {
    this.cells.clear()
  }

  /** 将实体插入网格 */
  insert(entityId: number, x: number, y: number, radius: number): void {
    const minCol = Math.floor((x - radius) / this.cellSize)
    const maxCol = Math.floor((x + radius) / this.cellSize)
    const minRow = Math.floor((y - radius) / this.cellSize)
    const maxRow = Math.floor((y + radius) / this.cellSize)

    for (let r = minRow; r <= maxRow; r++) {
      for (let c = minCol; c <= maxCol; c++) {
        const key = r * this.cols + c
        let cell = this.cells.get(key)
        if (!cell) { cell = []; this.cells.set(key, cell) }
        cell.push(entityId)
      }
    }
  }

  /** 查询某位置+半径附近的所有候选实体（去重） */
  query(x: number, y: number, radius: number): number[] {
    const seen = new Set<number>()
    const result: number[] = []

    const minCol = Math.floor((x - radius) / this.cellSize)
    const maxCol = Math.floor((x + radius) / this.cellSize)
    const minRow = Math.floor((y - radius) / this.cellSize)
    const maxRow = Math.floor((y + radius) / this.cellSize)

    for (let r = minRow; r <= maxRow; r++) {
      for (let c = minCol; c <= maxCol; c++) {
        const key = r * this.cols + c
        const cell = this.cells.get(key)
        if (!cell) continue
        for (const eid of cell) {
          if (!seen.has(eid)) {
            seen.add(eid)
            result.push(eid)
          }
        }
      }
    }
    return result
  }

  /** 获取所有有实体的网格的候选对（宽相） */
  getPotentialPairs(): [number, number][] {
    const pairs: [number, number][] = []
    const globalSeen = new Set<string>()

    for (const cell of this.cells.values()) {
      for (let i = 0; i < cell.length; i++) {
        for (let j = i + 1; j < cell.length; j++) {
          const a = cell[i], b = cell[j]
          const key = a < b ? `${a}:${b}` : `${b}:${a}`
          if (!globalSeen.has(key)) {
            globalSeen.add(key)
            pairs.push(a < b ? [a, b] : [b, a])
          }
        }
      }
    }
    return pairs
  }
}
