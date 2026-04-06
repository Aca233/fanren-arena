import { World } from './World'

/**
 * Scheduler —— 基于 requestAnimationFrame 的 60FPS 游戏主循环
 *
 * 特性：
 *   - DeltaTime 自动计算，上限 1/30s（防止"死亡螺旋"）
 *   - 实时 FPS 统计（每秒更新一次）
 *   - 支持暂停/恢复，不销毁 World 状态
 */
export class Scheduler {
  private readonly world: World
  private rafId: number | null = null
  private lastTimestamp = 0
  private _fps = 0
  private frameCount = 0
  private fpsAccumulator = 0

  /** DeltaTime 上限：即使帧率跌到 15fps 也不会雪崩 */
  private readonly MAX_DT = 1 / 30

  /** DeltaTime 下限：防止亚像素精度问题 */
  private readonly MIN_DT = 1 / 240

  get isRunning(): boolean {
    return this.rafId !== null
  }

  /** 当前测量帧率（每秒更新） */
  get fps(): number {
    return this._fps
  }

  constructor(world: World) {
    this.world = world
  }

  /** 启动主循环 */
  start(): void {
    if (this.isRunning) return
    this.world.start()
    this.lastTimestamp = performance.now()
    this.rafId = requestAnimationFrame(this._loop)
  }

  /** 暂停主循环（保留 World 状态） */
  pause(): void {
    if (!this.isRunning) return
    cancelAnimationFrame(this.rafId!)
    this.rafId = null
  }

  /** 恢复主循环 */
  resume(): void {
    if (this.isRunning) return
    this.lastTimestamp = performance.now()
    this.rafId = requestAnimationFrame(this._loop)
  }

  /** 停止并重置 */
  stop(): void {
    this.pause()
    this.world.stop()
    this._fps = 0
    this.frameCount = 0
    this.fpsAccumulator = 0
  }

  private readonly _loop = (timestamp: number): void => {
    // 计算 deltaTime（秒）
    let dt = (timestamp - this.lastTimestamp) / 1000
    this.lastTimestamp = timestamp

    // 钳位：防止浏览器标签切回后的超大 dt
    dt = Math.min(dt, this.MAX_DT)
    dt = Math.max(dt, this.MIN_DT)

    // FPS 统计
    this.frameCount++
    this.fpsAccumulator += dt
    if (this.fpsAccumulator >= 1.0) {
      this._fps = Math.round(this.frameCount / this.fpsAccumulator)
      this.frameCount = 0
      this.fpsAccumulator = 0
    }

    // 驱动 World
    this.world.update(dt)

    // 注册下一帧
    this.rafId = requestAnimationFrame(this._loop)
  }
}
