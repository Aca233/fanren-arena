import { useEffect, useRef, useState } from 'react'
import { World } from '../ecs/World'
import { Scheduler } from '../ecs/Scheduler'
import { createTransform } from '../components/Transform'
import { createRender } from '../components/Render'
import { createHealth, createMana, createSpirituality } from '../components/Stats'
import { createTag } from '../components/Tag'
import { createCircleCollider, LAYER_PLAYER, LAYER_ENEMY } from '../components/Collider'
import { createMovement } from '../components/Movement'
import { createEvasion } from '../components/Evasion'
import { createDivineSense } from '../components/DivineSense'
import { createBoid } from '../components/Boid'
import { createAIController } from '../components/AIController'
import type { DivineSenseComponent } from '../components/DivineSense'
import type { ArtifactInstanceComponent } from '../components/ArtifactInstance'
import type { HealthComponent, SpiritualityComponent } from '../components/Stats'
import type { EvasionComponent } from '../components/Evasion'
import type { TagComponent } from '../components/Tag'
import { WebGLRenderSystem } from '../systems/WebGLRenderSystem'
import { InputSystem } from '../systems/InputSystem'
import { MovementSystem } from '../systems/MovementSystem'
import { EvasionSystem } from '../systems/EvasionSystem'
import { BulletHellSystem } from '../systems/BulletHellSystem'
import { DivineSenseSystem } from '../systems/DivineSenseSystem'
import { ArtifactControlSystem } from '../systems/ArtifactControlSystem'
import { BehaviorSystem } from '../systems/BehaviorSystem'
import { AuraSystem } from '../systems/AuraSystem'
import { ScriptSystem } from '../systems/ScriptSystem'
import { CollisionSystem } from '../systems/CollisionSystem'
import { TagCounterSystem } from '../systems/TagCounterSystem'
import { BoidsSystem } from '../systems/BoidsSystem'
import { AISystem } from '../systems/AISystem'
import { VFXSystem } from '../systems/VFXSystem'
import { SwordFormationSystem } from '../systems/SwordFormationSystem'
import { CultivationSystem } from '../systems/CultivationSystem'
import type { SwordFormationComponent } from '../components/SwordFormation'
import type { CultivationComponent, HeavyOriginComponent } from '../components/Cultivation'
import { createCultivation, createHeavyOrigin } from '../components/Cultivation'
import { useBattleStore } from '../store/battleStore'

const SIDE_PANEL_W = 180

interface Props { onBack: () => void }

let _world: World | null = null
let _playerId = -1
let _swordFormSys: SwordFormationSystem | null = null
let _swordFormCtrlId = -1
let _cultSys: CultivationSystem | null = null
let _cw = 900, _ch = 580

const SLOTS: (string | null)[] = [
  'qinggang_sword', 'lieyang_bead', 'bingxin_needle', 'jingang_shield', 'youming_flag',
  null, null, null, null,
]
const SLOT_NAMES: Record<string, string> = {
  qinggang_sword: '青钢剑', lieyang_bead: '烈阳珠', bingxin_needle: '冰心针',
  jingang_shield: '金刚盾', youming_flag: '幽冥幡',
}
const SLOT_COLORS: Record<string, string> = {
  qinggang_sword: '#4488ff', lieyang_bead: '#ff6622', bingxin_needle: '#aaddff',
  jingang_shield: '#d4af37', youming_flag: '#8833cc',
}

export default function Sandbox({ onBack }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const overlayRef = useRef<HTMLCanvasElement>(null)
  const store = useBattleStore()
  const [swordCount, setSwordCount] = useState(72)
  const [guardRatio, setGuardRatio] = useState(100) // 护体比例 %
  const [splitCount, setSplitCount] = useState(3) // 每剑分几个

  useEffect(() => {
    const canvas = canvasRef.current
    const overlay = overlayRef.current
    if (!canvas || !overlay) return

    // 自适应窗口
    const rect = canvas.parentElement?.getBoundingClientRect()
    const CW = Math.floor((rect?.width ?? window.innerWidth - SIDE_PANEL_W)) - SIDE_PANEL_W
    const CH = Math.floor((rect?.height ?? window.innerHeight - 100))
    _cw = CW; _ch = CH

    const world = new World(1000)
    _world = world

    // ── 全部系统按执行顺序注册 ──
    const inputSys = new InputSystem(overlay) // 绑定到顶层 canvas
    const moveSys = new MovementSystem(); moveSys.setBounds(CW, CH)
    const evasionSys = new EvasionSystem(); evasionSys.setBounds(CW, CH)
    const bulletSys = new BulletHellSystem(); bulletSys.setBounds(CW, CH)
    const divineSys = new DivineSenseSystem()
    const artCtrlSys = new ArtifactControlSystem(); artCtrlSys.setBounds(CW, CH)
    const boidsSys = new BoidsSystem(); boidsSys.setBounds(CW, CH)
    const aiSys = new AISystem(); aiSys.setBounds(CW, CH)
    const behaviorSys = new BehaviorSystem()
    const auraSys = new AuraSystem()
    const scriptSys = new ScriptSystem()
    const collSys = new CollisionSystem()
    const tagCounterSys = new TagCounterSystem()
    const renderSys = new WebGLRenderSystem(); renderSys.setup(canvas, overlay, CW, CH)
    const vfxSys = new VFXSystem(); vfxSys.setContext(overlay.getContext('2d')!)
    const swordFormSys = new SwordFormationSystem(); swordFormSys.setBounds(CW, CH)
    const cultSys = new CultivationSystem()
    _swordFormSys = swordFormSys
    _cultSys = cultSys

    world
      .addSystem(inputSys)
      .addSystem(moveSys)
      .addSystem(evasionSys)
      .addSystem(bulletSys)
      .addSystem(divineSys)
      .addSystem(artCtrlSys)
      .addSystem(boidsSys)
      .addSystem(aiSys)
      .addSystem(behaviorSys)
      .addSystem(auraSys)
      .addSystem(scriptSys)
      .addSystem(swordFormSys)
      .addSystem(cultSys)
      .addSystem(collSys)
      .addSystem(tagCounterSys)
      .addSystem(renderSys)
      .addSystem(vfxSys)

    // ── 玩家 ──
    const player = world.createEntity()
    _playerId = player
    const pr = createRender(16, '#66aaff', '修士'); pr.glowColor = '#4488ff'
    world
      .addComponent(player, createTransform(CW / 2, CH / 2))
      .addComponent(player, pr)
      .addComponent(player, createHealth(1000))
      .addComponent(player, createMana(500, 15))
      .addComponent(player, createMovement(220, { boostMultiplier: 1.9, friction: 0.80 }))
      .addComponent(player, createEvasion({ name: '罗烟步', dashSpeed: 850, cooldown: 1.2 }))
      .addComponent(player, createCircleCollider(16, 1, { layer: LAYER_PLAYER, mask: LAYER_ENEMY }))
      .addComponent(player, createTag('player'))
      .addComponent(player, createCultivation('qingyuan_sword_art', 10))
      .addComponent(player, createHeavyOrigin())
      .addComponent(player, createDivineSense(100, SLOTS))

    const scheduler = new Scheduler(world)
    scheduler.start()

    store.addLog('化神期试剑室 —— 全系统已接入', '#44cc88')
    store.addLog('1~5 法宝 | WASD 移动 | 左键发符 | Q 扇形 | 右键遁/追击', '#8899aa')
    store.addLog('T 青竹蜂云剑 | F 切换形态 | E 虫云 | R 灵兽', '#8899aa')

    // ── Zustand 同步 ──
    const syncTimer = setInterval(() => {
      if (!_world) return
      const hp = _world.getComponent<HealthComponent>(_playerId, 'Health')
      const ev = _world.getComponent<EvasionComponent>(_playerId, 'Evasion')
      const ds = _world.getComponent<DivineSenseComponent>(_playerId, 'DivineSense')

      const arts: { name: string; state: string; spirituality: number; maxSpirituality: number }[] = []
      if (ds) {
        for (const aid of ds.activeArtifacts) {
          const inst = _world.getComponent<ArtifactInstanceComponent>(aid, 'ArtifactInstance')
          const sp = _world.getComponent<SpiritualityComponent>(aid, 'Spirituality')
          if (inst) arts.push({
            name: SLOT_NAMES[inst.presetId] ?? inst.presetId,
            state: inst.state,
            spirituality: sp?.current ?? 0,
            maxSpirituality: sp?.max ?? 1,
          })
        }
        _world.globals._divineOverloaded = ds.overloaded
      }

      store.sync({
        hp: hp?.current ?? 0, hpMax: hp?.max ?? 1,
        divineCurrent: ds?.current ?? 0, divineMax: ds?.max ?? 1,
        divineOverloaded: ds?.overloaded ?? false,
        evasionState: ev?.state ?? 'ready',
        evasionCooldown: ev?.cooldownRemaining ?? 0,
        activeArtifacts: arts,
        fps: scheduler.fps,
        entityCount: _world.entityCount,
        timeScale: (_world.globals.timeScale as number) ?? 1,
      })
    }, 250)

    return () => { clearInterval(syncTimer); scheduler.stop(); _world = null; _playerId = -1; _swordFormSys = null; _swordFormCtrlId = -1; _cultSys = null }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── 召唤 ──
  const spawnDummy = () => {
    if (!_world) return
    const x = 80 + Math.random() * (_cw - 160), y = 80 + Math.random() * (_ch - 160)
    const e = _world.createEntity()
    _world.addComponent(e, createTransform(x, y)).addComponent(e, createRender(22, '#664433', `桩#${e}`))
      .addComponent(e, createHealth(500)).addComponent(e, createCircleCollider(22, 8, { layer: LAYER_ENEMY, mask: 0b1111 }))
      .addComponent(e, createTag('dummy'))
    store.addLog(`召唤木桩 #${e}`, '#cc8844')
  }

  const spawnSwarm = () => {
    if (!_world) return
    const cx = _cw / 2, cy = _ch / 2
    const enemies = _world.query(['Transform', 'Tag'])
    const target = enemies.find(eid => {
      const t = _world!.getComponent<TagComponent>(eid, 'Tag')
      return t && t.role === 'dummy'
    }) ?? -1

    for (let i = 0; i < 24; i++) {
      const angle = (i / 24) * Math.PI * 2
      const e = _world.createEntity()
      const tf = createTransform(cx + Math.cos(angle) * 40, cy + Math.sin(angle) * 40)
      tf.vx = Math.cos(angle) * 100; tf.vy = Math.sin(angle) * 100
      const r = createRender(3, '#aacc22'); r.glowColor = '#88aa00'
      _world.addComponent(e, tf).addComponent(e, r)
        .addComponent(e, createSpirituality(20))
        .addComponent(e, createCircleCollider(3, 0.05, { layer: LAYER_ENEMY, mask: LAYER_ENEMY }))
        .addComponent(e, createTag('artifact', ['swarm']))
        .addComponent(e, createBoid('swarm_1', { targetId: target, maxSpeed: 250, seekWeight: 4, cohesionWeight: 2.5 }))
    }
    store.addLog(`祭出噬金虫云（24体）→ 目标 #${target}`, '#aacc22')
  }

  const spawnBeast = () => {
    if (!_world) return
    const x = 100 + Math.random() * (_cw - 200), y = 100 + Math.random() * (_ch - 200)
    const isFlanker = Math.random() > 0.5
    const e = _world.createEntity()
    const color = isFlanker ? '#44bbcc' : '#cc6644'
    const name = isFlanker ? '六翼霜蚣' : '啼魂兽'
    const r = createRender(14, color, name); r.glowColor = color
    _world.addComponent(e, createTransform(x, y)).addComponent(e, r)
      .addComponent(e, createHealth(400))
      .addComponent(e, createCircleCollider(14, 3, { layer: LAYER_ENEMY, mask: 0b1111 }))
      .addComponent(e, createTag('enemy', isFlanker ? [] : ['ghost']))
      .addComponent(e, createAIController(x, y, {
        specialBehavior: isFlanker ? 'flanker' : 'ghost_hunter',
        moveSpeed: isFlanker ? 200 : 140,
        attackDamage: isFlanker ? 35 : 20,
        senseRadius: 200,
      }))
    store.addLog(`召唤【${name}】#${e}`, color)
  }

  const spawnSwordFormation = () => {
    if (!_world || !_swordFormSys) return
    if (_swordFormCtrlId !== -1) {
      // 已祭出 → 回收
      _swordFormSys.recallAll(_world, _swordFormCtrlId)
      _world.destroyEntity(_swordFormCtrlId)
      _swordFormCtrlId = -1
      store.addLog('收回【青竹蜂云剑】', '#aa8820')
      return
    }
    _swordFormCtrlId = _swordFormSys.spawnSwords(_world, _playerId, swordCount)
    _swordFormSys.setGuardRatio(_world, _swordFormCtrlId, guardRatio / 100)
    store.addLog(`祭出【青竹蜂云剑】${swordCount}剑 · 护${guardRatio}%`, '#d4af37')
  }

  const onSwordCountChange = (val: number) => {
    setSwordCount(val)
    if (_world && _swordFormSys && _swordFormCtrlId !== -1) {
      _swordFormSys.adjustCount(_world, _swordFormCtrlId, val)
    }
  }

  const getSwordMode = (): string => {
    if (!_world || _swordFormCtrlId === -1) return '未祭出'
    const sf = _world.getComponent<SwordFormationComponent>(_swordFormCtrlId, 'SwordFormation')
    if (!sf) return '未祭出'
    const labels: Record<string, string> = { guardian: '游鱼护体', assault: '蜂云绞杀', domain: '大庚剑阵' }
    return `${labels[sf.mode]} (${sf.swordIds.length}剑)`
  }

  const getCultInfo = () => {
    if (!_world || _playerId === -1) return null
    const cult = _world.getComponent<CultivationComponent>(_playerId, 'Cultivation')
    const ho = _world.getComponent<HeavyOriginComponent>(_playerId, 'HeavyOrigin')
    if (!cult) return null
    return { cult, ho }
  }

  const doAddExp = (amount: number) => {
    if (_world && _cultSys) _cultSys.addExp(_world, _playerId, amount)
  }

  const doPrestige = () => {
    if (_world && _cultSys) {
      if (_cultSys.prestige(_world, _playerId)) {
        store.addLog('散功重修！转数+1，等级重置', '#ff8844')
      }
    }
  }

  // ── 读取 Zustand ──
  const { fps, entityCount, hp, hpMax, divineCurrent, divineMax, divineOverloaded,
    evasionState, evasionCooldown, activeArtifacts, timeScale, log } = useBattleStore()

  const hpPct = hp / hpMax
  const dvPct = divineCurrent / divineMax

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#05050a', color: '#e8e0d0', fontFamily: 'monospace', userSelect: 'none' }}>
      {/* 顶栏 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.7rem', padding: '0.35rem 1rem', background: '#0f0f1a', borderBottom: '1px solid #2a2a3a', flexShrink: 0, flexWrap: 'wrap' }}>
        <button onClick={onBack} style={tb('#2a1a1a')}>← 返回</button>
        <span style={{ color: '#d4af37', fontWeight: 'bold', fontSize: '0.85rem' }}>化神期 · 全系统</span>

        <Bar label="HP" pct={hpPct} color={hpPct > 0.5 ? '#44cc88' : '#cc3333'} value={`${Math.round(hp)}`} />
        <Bar label={divineOverloaded ? '过载!' : '神识'} pct={dvPct}
          color={divineOverloaded ? '#ff2222' : dvPct > 0.8 ? '#ccaa22' : '#4488cc'}
          value={`${divineCurrent}/${divineMax}`} warn={divineOverloaded} />

        <div style={{ fontSize: '0.6rem', padding: '0.12rem 0.35rem', background: evasionState === 'ready' && evasionCooldown <= 0 ? '#1a3a1a' : '#2a1a1a', border: `1px solid ${evasionState === 'ready' ? '#44aa44' : '#663333'}`, borderRadius: 3, color: evasionState === 'ready' ? '#44cc88' : '#cc6644' }}>
          遁 {evasionCooldown > 0 ? evasionCooldown.toFixed(1) : evasionState}
        </div>

        {timeScale !== 1 && <span style={{ fontSize: '0.6rem', color: '#ffaa22' }}>⏱ {timeScale}×</span>}

        <span style={{ marginLeft: 'auto', color: fps >= 55 ? '#44cc88' : '#cc3333', fontSize: '0.75rem' }}>{fps} FPS</span>
        <span style={{ color: '#556', fontSize: '0.7rem' }}>E:{entityCount}</span>
      </div>

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <div style={{ position: 'relative', flex: 1 }}>
          <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />
          <canvas ref={overlayRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', cursor: 'crosshair' }} />
        </div>

        {/* 右面板 */}
        <div style={{ display: 'flex', flexDirection: 'column', padding: '0.5rem', gap: '0.3rem', background: '#0a0a14', borderLeft: '1px solid #2a2a3a', overflowY: 'auto', width: SIDE_PANEL_W, flexShrink: 0 }}>
          <div style={st}>⚙ 召唤</div>
          <button onClick={spawnDummy} style={ab('#3a1a0a')}>木桩 ×1</button>
          <button onClick={() => { for (let i = 0; i < 5; i++) spawnDummy() }} style={ab('#3a1a0a')}>木桩 ×5</button>
          <button onClick={spawnSwarm} style={ab('#2a3a0a')}>噬金虫云 (E)</button>
          <button onClick={spawnBeast} style={ab('#1a2a3a')}>灵兽 (R)</button>
          <button onClick={spawnSwordFormation} style={{ ...ab('#3a2a0a'), display: 'flex', alignItems: 'center', gap: '0.3rem', justifyContent: 'center' }}>
            <img src="/qingzhu-sword.svg" alt="" style={{ width: 16, height: 16 }} />
            {_swordFormCtrlId !== -1 ? '收回蜂云剑' : '祭出蜂云剑'}
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.6rem' }}>
            <span style={{ color: '#aa8820' }}>{swordCount}剑</span>
            <input type="range" min={6} max={72} step={6} value={swordCount}
              onChange={e => onSwordCountChange(Number(e.target.value))}
              style={{ flex: 1, accentColor: '#d4af37', height: 4 }} />
          </div>

          {_swordFormCtrlId !== -1 && (<>
            <div style={{ fontSize: '0.6rem', color: '#d4af37', padding: '0.15rem 0.3rem', background: '#1a1a0a', borderRadius: 3, border: '1px solid #d4af3733', textAlign: 'center' }}>
              {getSwordMode()}
            </div>
            <div style={{ display: 'flex', gap: '0.25rem' }}>
              <button onClick={() => _swordFormSys?.setMode(_world!, _swordFormCtrlId, 'guardian')}
                style={{ ...modeBtn, background: getSwordMode().includes('护体') ? '#1a3a1a' : '#141418', borderColor: getSwordMode().includes('护体') ? '#44aa44' : '#2a2a3a' }}>
                护体
              </button>
              <button onClick={() => _swordFormSys?.setMode(_world!, _swordFormCtrlId, 'assault')}
                style={{ ...modeBtn, background: getSwordMode().includes('绞杀') ? '#3a1a0a' : '#141418', borderColor: getSwordMode().includes('绞杀') ? '#cc6622' : '#2a2a3a' }}>
                绞杀
              </button>
              <button onClick={() => {
                  if (_world && _cultSys && !_cultSys.canUseDagengArray(_world, _playerId)) {
                    store.addLog('需要祭出青竹蜂云剑 + 青元剑诀10级', '#cc4444')
                    return
                  }
                  _swordFormSys?.setMode(_world!, _swordFormCtrlId, 'domain')
                }}
                style={{ ...modeBtn, background: getSwordMode().includes('剑阵') ? '#2a1a0a' : '#141418', borderColor: getSwordMode().includes('剑阵') ? '#d4af37' : '#2a2a3a' }}>
                剑阵
              </button>
              <button onClick={() => {
                if (!_world || !_cultSys) return
                const sf = _world.getComponent<SwordFormationComponent>(_swordFormCtrlId, 'SwordFormation')
                if (sf && sf.mode === 'guardian') { store.addLog('护体模式不可分光', '#cc4444'); return }
                if (_world.globals._splitActive) { _cultSys.unsplit(_world, _playerId); store.addLog('合剑', '#aa8820') }
                else { _cultSys.doAutoSplit(_world, _playerId, splitCount); store.addLog(`分光×${splitCount}`, '#d4af37') }
              }} style={{ ...modeBtn, background: _world?.globals._splitActive ? '#2a1a0a' : '#141418',
                borderColor: _world?.globals._splitActive ? '#cc8822' : '#2a2a3a' }}>
                {_world?.globals._splitActive ? '合' : '分'}
              </button>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.55rem', marginTop: '0.1rem' }}>
              <span style={{ color: '#cc8822', whiteSpace: 'nowrap' }}>分{splitCount}</span>
              <input type="range" min={2} max={8} step={1} value={splitCount}
                onChange={e => {
                  const v = Number(e.target.value); setSplitCount(v)
                  if (_world) _world.globals._splitCountSetting = v
                  // 实时更改：先合再分
                  if (_world && _cultSys && _world.globals._splitActive) {
                    _cultSys.unsplit(_world, _playerId)
                    setTimeout(() => { if (_world && _cultSys) _cultSys.doAutoSplit(_world, _playerId, v) }, 50)
                  }
                }}
                style={{ flex: 1, accentColor: '#cc8822', height: 3 }} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.55rem', marginTop: '0.15rem' }}>
              <span style={{ color: '#44aa44', whiteSpace: 'nowrap' }}>护{guardRatio}%</span>
              <input type="range" min={0} max={100} step={10} value={guardRatio}
                onChange={e => {
                  const v = Number(e.target.value)
                  setGuardRatio(v)
                  if (_world && _swordFormSys && _swordFormCtrlId !== -1) {
                    _swordFormSys.setGuardRatio(_world, _swordFormCtrlId, v / 100)
                  }
                }}
                style={{ flex: 1, accentColor: '#44aa44', height: 3 }} />
              <span style={{ color: '#cc6622', whiteSpace: 'nowrap' }}>攻{100 - guardRatio}%</span>
            </div>
          </>)}

          <div style={st}>⚔ 法宝 (1~5)</div>
          {SLOTS.slice(0, 5).map((s, i) => s && (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.65rem', padding: '0.15rem 0.3rem', background: '#141420', borderRadius: 3, border: `1px solid ${SLOT_COLORS[s]}33` }}>
              <span style={{ color: '#556', width: 12 }}>{i + 1}</span>
              <span style={{ width: 5, height: 5, borderRadius: '50%', background: SLOT_COLORS[s] }} />
              <span style={{ color: SLOT_COLORS[s] }}>{SLOT_NAMES[s]}</span>
            </div>
          ))}

          <div style={st}>📡 在场</div>
          {activeArtifacts.length === 0
            ? <div style={{ fontSize: '0.6rem', color: '#334' }}>无</div>
            : activeArtifacts.map((a, i) => (
              <div key={i} style={{ fontSize: '0.6rem' }}>
                <span style={{ color: a.state === 'chasing' ? '#ff8844' : a.state === 'stunned' ? '#ff4444' : '#88aacc' }}>
                  {a.name} [{a.state}]
                </span>
                <span style={{ color: '#556', marginLeft: '0.3rem' }}>{Math.round(a.spirituality)}/{a.maxSpirituality}</span>
              </div>
            ))
          }

          <div style={st}>📜 功法</div>
          {(() => {
            const info = getCultInfo()
            if (!info) return <div style={{ fontSize: '0.55rem', color: '#445' }}>无</div>
            const { cult, ho } = info
            const tierNames: Record<string, string> = { qi: '炼气', foundation: '筑基', core: '结丹', nascent: '元婴', deity: '化神' }
            const pct = cult.expToNext > 0 ? cult.exp / cult.expToNext : 0
            return (<>
              <div style={{ fontSize: '0.6rem', color: '#88cc44' }}>青元剑诀 Lv.{cult.level}</div>
              <div style={{ fontSize: '0.55rem', color: '#667' }}>{tierNames[cult.tier] ?? cult.tier} · 修为 {cult.exp}/{cult.expToNext}</div>
              <div style={{ width: '100%', height: 4, background: '#1a1a2a', borderRadius: 2, overflow: 'hidden' }}>
                <div style={{ width: `${pct * 100}%`, height: '100%', background: '#88cc44' }} />
              </div>
              <div style={{ display: 'flex', gap: '0.2rem', marginTop: '0.15rem' }}>
                <button onClick={() => doAddExp(50)} style={{ ...modeBtn, fontSize: '0.5rem' }}>+50修为</button>
                <button onClick={() => doAddExp(200)} style={{ ...modeBtn, fontSize: '0.5rem' }}>+200修为</button>
              </div>
              {ho && (
                <div style={{ fontSize: '0.55rem', marginTop: '0.15rem' }}>
                  <span style={{ color: '#cc8833' }}>三转重元功 {ho.turnCount}/3转</span>
                  <span style={{ color: '#667', marginLeft: '0.3rem' }}>法力×{ho.manaMultiplier} 密度{ho.manaDensity}</span>
                  {ho.canPrestige && (
                    <button onClick={doPrestige} style={{ ...modeBtn, fontSize: '0.5rem', marginTop: '0.1rem', background: '#3a1a0a', borderColor: '#cc4422', color: '#ff6644', width: '100%' }}>
                      散功重修（转数+1）
                    </button>
                  )}
                </div>
              )}
              <div style={{ fontSize: '0.5rem', color: '#556', marginTop: '0.1rem' }}>
                技能：{cult.unlockedSkills.map(s => {
                  const names: Record<string, string> = { sword_gleam: '剑芒', sword_shield: '剑盾(B)', shadow_split: '分光(V)', dageng_array: '剑阵' }
                  const cd = cult.skillCooldowns[s]
                  return <span key={s} style={{ marginRight: '0.3rem', color: cd ? '#554' : '#88aa66' }}>{names[s] ?? s}{cd ? ` ${cd.toFixed(1)}s` : ''}</span>
                })}
              </div>
            </>)
          })()}

          <div style={st}>📖 操作</div>
          <div style={{ fontSize: '0.55rem', color: '#445', lineHeight: 1.6 }}>
            WASD 移动 | Shift 提气{'\n'}
            左键 符箓 | Q 扇形三连{'\n'}
            右键 遁/指派追击{'\n'}
            Shift+左键 划线绕后{'\n'}
            1~5 祭出法宝{'\n'}
            E 虫云 | R 灵兽
          </div>
        </div>
      </div>

      {/* 日志 */}
      <div style={{ height: 60, background: '#07070f', borderTop: '1px solid #2a2a3a', padding: '0.2rem 1rem', overflowY: 'auto', fontSize: '0.63rem', flexShrink: 0 }}>
        {log.map((e, i) => (
          <div key={i} style={{ color: e.color }}><span style={{ color: '#252540', marginRight: '0.3rem' }}>[{e.time}]</span>{e.msg}</div>
        ))}
      </div>
    </div>
  )
}

// ── 小组件 ──
function Bar({ label, pct, color, value, warn }: { label: string; pct: number; color: string; value: string; warn?: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
      <span style={{ fontSize: '0.6rem', color: warn ? '#ff4444' : '#667' }}>{label}</span>
      <div style={{ width: 80, height: 6, background: '#1a1a2a', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ width: `${pct * 100}%`, height: '100%', background: color, transition: 'width 0.15s' }} />
      </div>
      <span style={{ fontSize: '0.55rem', color: '#667' }}>{value}</span>
    </div>
  )
}

function tb(bg: string) { return { padding: '0.2rem 0.5rem', background: bg, border: '1px solid #2a2a3a', borderRadius: 3, color: '#c0b8d0', fontSize: '0.7rem', cursor: 'pointer' } as const }
function ab(bg: string) { return { padding: '0.3rem 0.45rem', background: bg, border: '1px solid #3a3a4a', borderRadius: 4, color: '#e8e0d0', fontSize: '0.7rem', cursor: 'pointer', width: '100%' } as const }
const st = { fontSize: '0.6rem', color: '#556', borderBottom: '1px solid #2a2a3a', paddingBottom: '0.12rem', marginTop: '0.2rem', letterSpacing: '0.08em' } as const
const modeBtn = { flex: 1, padding: '0.25rem', background: '#141418', border: '1px solid #2a2a3a', borderRadius: 3, color: '#c0b8a0', fontSize: '0.6rem', cursor: 'pointer', textAlign: 'center' as const } as const
