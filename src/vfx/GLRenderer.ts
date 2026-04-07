/**
 * GLRenderer —— WebGL2 实例化精灵渲染器
 *
 * 核心：1 次 draw call 绘制数千个精灵（飞剑/粒子/实体）
 * 每个实例传入：位置(x,y)、旋转、缩放、颜色(RGBA)
 */

const VERT_SRC = `#version 300 es
precision highp float;

// 单位四边形顶点
layout(location=0) in vec2 a_pos;
layout(location=1) in vec2 a_uv;

// 实例属性
layout(location=2) in vec2 i_translate; // 世界坐标
layout(location=3) in float i_rotation;
layout(location=4) in float i_scale;
layout(location=5) in vec4 i_color;
layout(location=6) in float i_texId; // 0=circle, 1=sword, 2=particle

uniform vec2 u_resolution;

out vec2 v_uv;
out vec4 v_color;
out float v_texId;

void main() {
  float c = cos(i_rotation);
  float s = sin(i_rotation);
  vec2 rotated = vec2(a_pos.x * c - a_pos.y * s, a_pos.x * s + a_pos.y * c);
  vec2 world = rotated * i_scale + i_translate;
  // 世界坐标 → NDC
  vec2 ndc = (world / u_resolution) * 2.0 - 1.0;
  ndc.y = -ndc.y;
  gl_Position = vec4(ndc, 0.0, 1.0);
  v_uv = a_uv;
  v_color = i_color;
  v_texId = i_texId;
}
`

const FRAG_SRC = `#version 300 es
precision highp float;

in vec2 v_uv;
in vec4 v_color;
in float v_texId;

uniform sampler2D u_swordTex;

out vec4 fragColor;

void main() {
  if (v_texId < 0.5) {
    // 圆形：用 UV 距中心判断
    float d = length(v_uv - 0.5) * 2.0;
    if (d > 1.0) discard;
    float alpha = smoothstep(1.0, 0.8, d);
    fragColor = v_color * vec4(1.0, 1.0, 1.0, alpha);
  } else if (v_texId < 1.5) {
    // 剑纹理
    vec4 tex = texture(u_swordTex, v_uv);
    if (tex.a < 0.05) discard;
    fragColor = tex * v_color;
  } else {
    // 粒子：柔和圆点
    float d = length(v_uv - 0.5) * 2.0;
    if (d > 1.0) discard;
    float alpha = 1.0 - d * d;
    fragColor = v_color * vec4(1.0, 1.0, 1.0, alpha);
  }
}
`

const MAX_INSTANCES = 4096

export interface SpriteInstance {
  x: number; y: number
  rotation: number
  scale: number
  r: number; g: number; b: number; a: number
  texId: number // 0=circle, 1=sword, 2=particle
}

export class GLRenderer {
  private gl: WebGL2RenderingContext
  private program: WebGLProgram
  private vao: WebGLVertexArrayObject
  private instanceBuffer: WebGLBuffer
  private instanceData: Float32Array
  private swordTexture: WebGLTexture | null = null
  private count = 0
  readonly width: number
  readonly height: number

  constructor(canvas: HTMLCanvasElement, w: number, h: number) {
    this.width = w
    this.height = h

    const dpr = window.devicePixelRatio || 1
    canvas.width = w * dpr
    canvas.height = h * dpr
    canvas.style.width = `${w}px`
    canvas.style.height = `${h}px`

    const gl = canvas.getContext('webgl2', { alpha: false, antialias: true })!
    this.gl = gl

    gl.viewport(0, 0, canvas.width, canvas.height)
    gl.enable(gl.BLEND)
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)

    // 编译着色器
    this.program = this._createProgram(VERT_SRC, FRAG_SRC)

    // 单位四边形（-0.5 ~ 0.5）
    const quadVerts = new Float32Array([
      -0.5, -0.5, 0, 0,
       0.5, -0.5, 1, 0,
       0.5,  0.5, 1, 1,
      -0.5, -0.5, 0, 0,
       0.5,  0.5, 1, 1,
      -0.5,  0.5, 0, 1,
    ])

    this.vao = gl.createVertexArray()!
    gl.bindVertexArray(this.vao)

    // 顶点缓冲
    const quadBuf = gl.createBuffer()!
    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf)
    gl.bufferData(gl.ARRAY_BUFFER, quadVerts, gl.STATIC_DRAW)
    gl.enableVertexAttribArray(0)
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 16, 0)
    gl.enableVertexAttribArray(1)
    gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 16, 8)

    // 实例缓冲 (translate.xy, rotation, scale, color.rgba, texId) = 9 floats
    this.instanceData = new Float32Array(MAX_INSTANCES * 9)
    this.instanceBuffer = gl.createBuffer()!
    gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceBuffer)
    gl.bufferData(gl.ARRAY_BUFFER, this.instanceData.byteLength, gl.DYNAMIC_DRAW)

    const stride = 9 * 4
    // i_translate (loc=2)
    gl.enableVertexAttribArray(2)
    gl.vertexAttribPointer(2, 2, gl.FLOAT, false, stride, 0)
    gl.vertexAttribDivisor(2, 1)
    // i_rotation (loc=3)
    gl.enableVertexAttribArray(3)
    gl.vertexAttribPointer(3, 1, gl.FLOAT, false, stride, 8)
    gl.vertexAttribDivisor(3, 1)
    // i_scale (loc=4)
    gl.enableVertexAttribArray(4)
    gl.vertexAttribPointer(4, 1, gl.FLOAT, false, stride, 12)
    gl.vertexAttribDivisor(4, 1)
    // i_color (loc=5)
    gl.enableVertexAttribArray(5)
    gl.vertexAttribPointer(5, 4, gl.FLOAT, false, stride, 16)
    gl.vertexAttribDivisor(5, 1)
    // i_texId (loc=6)
    gl.enableVertexAttribArray(6)
    gl.vertexAttribPointer(6, 1, gl.FLOAT, false, stride, 32)
    gl.vertexAttribDivisor(6, 1)

    gl.bindVertexArray(null)

    // 加载剑纹理
    this._loadSwordTexture()
  }

  /** 每帧开始前清空 */
  begin(): void {
    this.count = 0
    const gl = this.gl
    gl.clearColor(0.04, 0.04, 0.06, 1)
    gl.clear(gl.COLOR_BUFFER_BIT)
  }

  /** 添加一个精灵实例 */
  push(inst: SpriteInstance): void {
    if (this.count >= MAX_INSTANCES) return
    const i = this.count * 9
    this.instanceData[i] = inst.x
    this.instanceData[i + 1] = inst.y
    this.instanceData[i + 2] = inst.rotation
    this.instanceData[i + 3] = inst.scale
    this.instanceData[i + 4] = inst.r
    this.instanceData[i + 5] = inst.g
    this.instanceData[i + 6] = inst.b
    this.instanceData[i + 7] = inst.a
    this.instanceData[i + 8] = inst.texId
    this.count++
  }

  /** 提交绘制（1 次 draw call） */
  flush(): void {
    if (this.count === 0) return
    const gl = this.gl

    gl.useProgram(this.program)
    gl.uniform2f(gl.getUniformLocation(this.program, 'u_resolution'), this.width, this.height)

    // 绑定剑纹理
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, this.swordTexture)
    gl.uniform1i(gl.getUniformLocation(this.program, 'u_swordTex'), 0)

    gl.bindVertexArray(this.vao)
    gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceBuffer)
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.instanceData.subarray(0, this.count * 9))

    gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, this.count)
    gl.bindVertexArray(null)
  }

  private _loadSwordTexture(): void {
    const gl = this.gl
    const tex = gl.createTexture()!
    this.swordTexture = tex

    // 先填 1x1 占位
    gl.bindTexture(gl.TEXTURE_2D, tex)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([212, 175, 55, 255]))

    const img = new Image()
    img.src = '/qingzhu-sword.svg'
    img.onload = () => {
      // SVG → 离屏 canvas → 纹理
      const offscreen = document.createElement('canvas')
      offscreen.width = 64; offscreen.height = 64
      const ctx = offscreen.getContext('2d')!
      ctx.drawImage(img, 0, 0, 64, 64)

      gl.bindTexture(gl.TEXTURE_2D, tex)
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, offscreen)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    }
  }

  private _createProgram(vSrc: string, fSrc: string): WebGLProgram {
    const gl = this.gl
    const vs = gl.createShader(gl.VERTEX_SHADER)!
    gl.shaderSource(vs, vSrc)
    gl.compileShader(vs)
    if (!gl.getShaderParameter(vs, gl.COMPILE_STATUS))
      console.error('VERT:', gl.getShaderInfoLog(vs))

    const fs = gl.createShader(gl.FRAGMENT_SHADER)!
    gl.shaderSource(fs, fSrc)
    gl.compileShader(fs)
    if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS))
      console.error('FRAG:', gl.getShaderInfoLog(fs))

    const prog = gl.createProgram()!
    gl.attachShader(prog, vs)
    gl.attachShader(prog, fs)
    gl.linkProgram(prog)
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS))
      console.error('LINK:', gl.getProgramInfoLog(prog))

    gl.deleteShader(vs)
    gl.deleteShader(fs)
    return prog
  }
}
