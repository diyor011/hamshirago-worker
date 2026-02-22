import { useState } from 'react'
import { motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import api from '../api/axios'

export default function NurseLogin() {
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const navigate = useNavigate()

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const fullPhone = '+998' + phone.replace(/\D/g, '')
      const { data } = await api.post('/nurses/login', { phone: fullPhone, password })
      localStorage.setItem('token', data.token)
      navigate('/dashboard')
    } catch (err) {
      setError(err.response?.data?.message || 'Ошибка входа')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: '#060A12', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none' }}>
        <div style={{ position: 'absolute', top: -100, left: '50%', transform: 'translateX(-50%)', width: 600, height: 600, borderRadius: '50%', background: 'radial-gradient(circle,rgba(16,185,129,0.08) 0%,transparent 70%)' }} />
      </div>

      <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} style={{ width: '100%', maxWidth: 420, position: 'relative', zIndex: 1 }}>
        <div style={{ textAlign: 'center', marginBottom: 36 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <div style={{ width: 44, height: 44, background: 'linear-gradient(135deg,#059669,#10B981)', borderRadius: 13, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontSize: 22 }}>👩‍⚕️</span>
            </div>
            <span style={{ fontWeight: 900, fontSize: 22, color: 'white' }}>Hamshira<span style={{ color: '#34D399' }}>Go</span></span>
          </div>
          <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: 14 }}>Панель медсестры</p>
        </div>

        <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 24, padding: 32 }}>
          <h2 style={{ color: 'white', fontSize: 20, fontWeight: 800, marginBottom: 24, textAlign: 'center' }}>Вход в систему</h2>

          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: 16 }}>
              <label style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 8 }}>ТЕЛЕФОН</label>
              <div style={{ display: 'flex', alignItems: 'center', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 14, overflow: 'hidden' }}>
                <div style={{ padding: '14px 14px 14px 16px', borderRight: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span>🇺🇿</span>
                  <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 14, fontWeight: 600 }}>+998</span>
                </div>
                <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="90 123 45 67"
                  style={{ flex: 1, background: 'none', border: 'none', outline: 'none', color: 'white', fontSize: 15, padding: '14px 16px', fontWeight: 600 }} />
              </div>
            </div>

            <div style={{ marginBottom: 24 }}>
              <label style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 8 }}>ПАРОЛЬ</label>
              <div style={{ display: 'flex', alignItems: 'center', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 14, overflow: 'hidden' }}>
                <input type={showPass ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••"
                  style={{ flex: 1, background: 'none', border: 'none', outline: 'none', color: 'white', fontSize: 15, padding: '14px 16px', fontWeight: 600 }} />
                <button type="button" onClick={() => setShowPass(v => !v)} style={{ padding: '0 16px', background: 'none', border: 'none', color: 'rgba(255,255,255,0.3)', cursor: 'pointer', fontSize: 16 }}>
                  {showPass ? '🙈' : '👁'}
                </button>
              </div>
            </div>

            {error && (
              <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 12, padding: '10px 14px', marginBottom: 16, color: '#FCA5A5', fontSize: 13 }}>
                {error}
              </div>
            )}

            <motion.button whileTap={{ scale: 0.97 }} type="submit" disabled={loading}
              style={{ width: '100%', padding: '15px', borderRadius: 14, border: 'none', background: loading ? 'rgba(255,255,255,0.06)' : 'linear-gradient(135deg,#059669,#10B981)', color: loading ? 'rgba(255,255,255,0.3)' : 'white', fontSize: 15, fontWeight: 800, cursor: loading ? 'not-allowed' : 'pointer', boxShadow: loading ? 'none' : '0 6px 24px rgba(16,185,129,0.35)' }}>
              {loading ? 'Входим...' : 'Войти'}
            </motion.button>
          </form>
        </div>
      </motion.div>
    </div>
  )
}
