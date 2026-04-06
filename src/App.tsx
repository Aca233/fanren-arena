import { useState } from 'react'
import Sandbox from './ui/Sandbox'

type View = 'menu' | 'sandbox' | 'arena'

export default function App() {
  const [view, setView] = useState<View>('menu')

  if (view === 'sandbox') return <Sandbox onBack={() => setView('menu')} />

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', height: '100vh',
      background: 'linear-gradient(180deg, #0a0a0f 0%, #1a0a20 100%)',
    }}>
      <h1 style={{ fontSize: '2.5rem', marginBottom: '0.5rem', color: '#d4af37', textShadow: '0 0 20px #d4af3788' }}>
        凡人修仙传
      </h1>
      <h2 style={{ fontSize: '1.2rem', marginBottom: '3rem', color: '#a090b0', letterSpacing: '0.3em' }}>
        斗法竞技场
      </h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', width: '200px' }}>
        <button onClick={() => setView('arena')} style={btnStyle('#8b1a1a')}>
          进入斗法
        </button>
        <button onClick={() => setView('sandbox')} style={btnStyle('#1a3a8b')}>
          试剑室
        </button>
      </div>
      <p style={{ marginTop: '2rem', fontSize: '0.75rem', color: '#504060' }}>
        第一阶段：炼气期 · ECS 引擎骨架
      </p>
    </div>
  )
}

function btnStyle(bg: string) {
  return {
    padding: '0.8rem 1.5rem',
    background: bg,
    border: '1px solid #ffffff22',
    borderRadius: '4px',
    color: '#e8e0d0',
    fontSize: '1rem',
    cursor: 'pointer',
    transition: 'all 0.2s',
  } as const
}
