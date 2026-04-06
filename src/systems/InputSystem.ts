import type { System } from '../ecs/types'
import type { World } from '../ecs/World'

/**
 * InputSystem —— 全局键盘/鼠标状态管理（双缓冲）
 *
 * 事件处理器写入 pending 缓冲区，每帧 update 时交换到 state
 * 保证同一帧内所有系统都能读到 justPressed/justReleased
 */
export interface InputState {
  keys: Set<string>
  justPressed: Set<string>
  justReleased: Set<string>
  mouseX: number
  mouseY: number
  mouseButtons: Set<number>
  mouseJustPressed: Set<number>
  mouseJustReleased: Set<number>
}

export class InputSystem implements System {
  readonly name = 'InputSystem'

  private readonly state: InputState = {
    keys: new Set(),
    justPressed: new Set(),
    justReleased: new Set(),
    mouseX: 0, mouseY: 0,
    mouseButtons: new Set(),
    mouseJustPressed: new Set(),
    mouseJustReleased: new Set(),
  }

  // ── 双缓冲：事件写入 pending，update 时交换到 state ──
  private readonly pendingKeyDown = new Set<string>()
  private readonly pendingKeyUp = new Set<string>()
  private readonly pendingMouseDown = new Set<number>()
  private readonly pendingMouseUp = new Set<number>()

  private readonly canvas: HTMLCanvasElement

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas
    this._bindEvents()
  }

  onStart(world: World): void {
    world.globals.input = this.state
  }

  update(_world: World, _dt: number): void {
    // 清除上一帧的 "just" 事件
    this.state.justPressed.clear()
    this.state.justReleased.clear()
    this.state.mouseJustPressed.clear()
    this.state.mouseJustReleased.clear()

    // 从 pending 缓冲交换到 state（本帧所有系统都能读到）
    for (const code of this.pendingKeyDown) {
      this.state.justPressed.add(code)
    }
    for (const code of this.pendingKeyUp) {
      this.state.justReleased.add(code)
    }
    for (const btn of this.pendingMouseDown) {
      this.state.mouseJustPressed.add(btn)
    }
    for (const btn of this.pendingMouseUp) {
      this.state.mouseJustReleased.add(btn)
    }

    // 清空 pending
    this.pendingKeyDown.clear()
    this.pendingKeyUp.clear()
    this.pendingMouseDown.clear()
    this.pendingMouseUp.clear()
  }

  onStop(): void {
    this._unbindEvents()
  }

  // ── 事件处理器：写入 pending 缓冲 ──

  private readonly _onKeyDown = (e: KeyboardEvent) => {
    if (!this.state.keys.has(e.code)) {
      this.pendingKeyDown.add(e.code)
    }
    this.state.keys.add(e.code)
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
      e.preventDefault()
    }
  }

  private readonly _onKeyUp = (e: KeyboardEvent) => {
    this.state.keys.delete(e.code)
    this.pendingKeyUp.add(e.code)
  }

  private readonly _onMouseMove = (e: MouseEvent) => {
    const rect = this.canvas.getBoundingClientRect()
    this.state.mouseX = e.clientX - rect.left
    this.state.mouseY = e.clientY - rect.top
  }

  private readonly _onMouseDown = (e: MouseEvent) => {
    this.state.mouseButtons.add(e.button)
    this.pendingMouseDown.add(e.button)
    e.preventDefault()
  }

  private readonly _onMouseUp = (e: MouseEvent) => {
    this.state.mouseButtons.delete(e.button)
    this.pendingMouseUp.add(e.button)
  }

  private _bindEvents(): void {
    window.addEventListener('keydown', this._onKeyDown)
    window.addEventListener('keyup', this._onKeyUp)
    this.canvas.addEventListener('mousemove', this._onMouseMove)
    this.canvas.addEventListener('mousedown', this._onMouseDown)
    this.canvas.addEventListener('mouseup', this._onMouseUp)
    this.canvas.addEventListener('contextmenu', e => e.preventDefault())
  }

  private _unbindEvents(): void {
    window.removeEventListener('keydown', this._onKeyDown)
    window.removeEventListener('keyup', this._onKeyUp)
    this.canvas.removeEventListener('mousemove', this._onMouseMove)
    this.canvas.removeEventListener('mousedown', this._onMouseDown)
    this.canvas.removeEventListener('mouseup', this._onMouseUp)
  }
}
