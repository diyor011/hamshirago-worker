import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { io } from 'socket.io-client'
import api from '../api/axios'

const SOCKET_URL = (import.meta.env.VITE_API_URL || 'http://localhost:3001/api').replace('/api', '')

// AudioContext — создаём один раз при первом взаимодействии пользователя
let _audioCtx = null
function getAudioCtx() {
  if (!_audioCtx) {
    _audioCtx = new (window.AudioContext || window.webkitAudioContext)()
  }
  return _audioCtx
}

// Хранит все осцилляторы текущего звука (чтобы можно было остановить)
let _activeOscillators = []

export function stopOrderSound() {
  _activeOscillators.forEach(osc => { try { osc.stop() } catch {} })
  _activeOscillators = []
}

// Громкое уведомление — повторяется 15 секунд
async function playOrderSound() {
  try {
    const ctx = getAudioCtx()
    if (ctx.state === 'suspended') await ctx.resume()

    stopOrderSound()

    const totalDuration = 15      // секунд
    const beatInterval = 1.0      // повтор каждую секунду
    const notes = [660, 880, 1100] // E5-A5-C#6 — резкий, слышимый сигнал

    for (let beat = 0; beat < totalDuration; beat++) {
      notes.forEach((freq, i) => {
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.connect(gain)
        gain.connect(ctx.destination)
        osc.type = 'square' // более резкий звук чем sine
        osc.frequency.value = freq

        const t = ctx.currentTime + beat * beatInterval + i * 0.12
        gain.gain.setValueAtTime(0, t)
        gain.gain.linearRampToValueAtTime(0.7, t + 0.02)  // громко
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.35)
        osc.start(t)
        osc.stop(t + 0.4)
        _activeOscillators.push(osc)
      })
    }
  } catch {}
}

const STATUS_STEPS = [
  { key: 'accepted', label: 'Принят',    btn: 'Начать движение',  next: 'on_way',    color: '#3B82F6' },
  { key: 'on_way',   label: 'В пути',    btn: 'Я прибыл(а)',      next: 'arrived',   color: '#F59E0B' },
  { key: 'arrived',  label: 'Прибыл(а)', btn: 'Начать процедуру', next: 'working',   color: '#8B5CF6' },
  { key: 'working',  label: 'Работаю',   btn: 'Завершить заказ',  next: 'completed', color: '#10B981' },
]

export default function NurseDashboard() {
  const [nurse, setNurse] = useState(null)
  const [isOnDuty, setIsOnDuty] = useState(false)
  const [loading, setLoading] = useState(false)
  const [gpsError, setGpsError] = useState('')
  const [incomingOrder, setIncomingOrder] = useState(null)
  const [activeOrder, setActiveOrder] = useState(() => {
    try { return JSON.parse(localStorage.getItem('nurse_order')) } catch { return null }
  })
  const [orderStatus, setOrderStatus] = useState(
    () => localStorage.getItem('nurse_order_status') || 'accepted'
  )
  const [countdown, setCountdown] = useState(30)
  const [todayOrders, setTodayOrders] = useState(() => {
    const saved = localStorage.getItem('nurse_today_orders')
    const savedDate = localStorage.getItem('nurse_today_date')
    const today = new Date().toDateString()
    if (savedDate !== today) return 0 // новый день — сброс
    return parseInt(saved) || 0
  })
  const navigate = useNavigate()
  const socketRef = useRef(null)
  const watchIdRef = useRef(null)
  const speedHistoryRef = useRef([]) // последние 5 замеров скорости (км/ч)

  useEffect(() => {
    api.get('/nurses/me')
      .then(r => { setNurse(r.data); setIsOnDuty(r.data.isAvailable) })
      .catch(() => navigate('/login'))
  }, [])

  // Инициализируем AudioContext при первом клике (требование браузера)
  useEffect(() => {
    const init = () => { getAudioCtx(); document.removeEventListener('click', init) }
    document.addEventListener('click', init)
    return () => document.removeEventListener('click', init)
  }, [])

  // Персистим активный заказ в localStorage
  useEffect(() => {
    if (activeOrder) localStorage.setItem('nurse_order', JSON.stringify(activeOrder))
    else localStorage.removeItem('nurse_order')
  }, [activeOrder])

  useEffect(() => {
    localStorage.setItem('nurse_order_status', orderStatus)
  }, [orderStatus])

  useEffect(() => {
    localStorage.setItem('nurse_today_orders', todayOrders)
    localStorage.setItem('nurse_today_date', new Date().toDateString())
  }, [todayOrders])

  useEffect(() => {
    const token = localStorage.getItem('token')
    if (!token) return
    let nurseId = null
    try { nurseId = JSON.parse(atob(token.split('.')[1])).id } catch {}

    const socket = io(SOCKET_URL, { transports: ['websocket'] })
    socketRef.current = socket

    // Регистрируем медсестру при каждом (ре)коннекте и восстанавливаем комнату заказа
    socket.on('connect', () => {
      if (nurseId) socket.emit('nurse:register', { nurseId, token })
      // Если был активный заказ — переподключаемся к его комнате
      try {
        const saved = JSON.parse(localStorage.getItem('nurse_order'))
        if (saved?.orderId) socket.emit('order:watch', { orderId: saved.orderId })
      } catch {}
    })

    socket.on('order:new', (order) => { setIncomingOrder(order); setCountdown(30); playOrderSound() })
    socket.on('order:taken', () => setIncomingOrder(null))
    socket.on('order:updated', ({ status }) => {
      setOrderStatus(status)
      if (status === 'completed') {
        setActiveOrder(null)
        setOrderStatus('accepted')
        localStorage.removeItem('nurse_order')
        localStorage.removeItem('nurse_order_status')
        setTodayOrders(n => n + 1)
      }
    })
    return () => socket.disconnect()
  }, [])

  useEffect(() => {
    if (!incomingOrder) return
    if (countdown <= 0) { stopOrderSound(); setIncomingOrder(null); return }
    const t = setTimeout(() => setCountdown(c => c - 1), 1000)
    return () => clearTimeout(t)
  }, [incomingOrder, countdown])

  useEffect(() => {
    if (!activeOrder) {
      if (watchIdRef.current != null) { navigator.geolocation.clearWatch(watchIdRef.current); watchIdRef.current = null }
      return
    }
    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude: lat, longitude: lng, speed } = pos.coords

        // Скользящее среднее скорости из последних 5 замеров
        let avgSpeed = null
        if (speed !== null && speed >= 0) {
          const kmh = speed * 3.6 // м/с → км/ч
          speedHistoryRef.current.push(kmh)
          if (speedHistoryRef.current.length > 5) speedHistoryRef.current.shift()
          avgSpeed = speedHistoryRef.current.reduce((a, b) => a + b, 0) / speedHistoryRef.current.length
          avgSpeed = Math.round(avgSpeed * 10) / 10
        }

        socketRef.current?.emit('nurse:location', {
          orderId: activeOrder.orderId,
          lat, lng,
          speed: avgSpeed, // реальная средняя скорость км/ч или null
        })
      },
      null,
      { enableHighAccuracy: true, maximumAge: 3000 }
    )
    return () => { if (watchIdRef.current != null) navigator.geolocation.clearWatch(watchIdRef.current) }
  }, [activeOrder])

  const toggleDuty = () => {
    if (isOnDuty) {
      api.put('/nurses/duty', { available: false })
      setIsOnDuty(false)
      return
    }
    setLoading(true); setGpsError('')
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          await api.put('/nurses/duty', { available: true, lat: pos.coords.latitude, lng: pos.coords.longitude })
          setIsOnDuty(true)
        } catch { setGpsError('Ошибка сервера') }
        setLoading(false)
      },
      () => { setGpsError('Разрешите доступ к геолокации'); setLoading(false) },
      { enableHighAccuracy: true }
    )
  }

  const acceptOrder = () => {
    stopOrderSound()
    socketRef.current?.emit('order:accept', { orderId: incomingOrder.orderId })
    socketRef.current?.emit('order:watch', { orderId: incomingOrder.orderId })
    setActiveOrder(incomingOrder)
    setOrderStatus('accepted')
    setIncomingOrder(null)
  }

  const declineOrder = () => {
    stopOrderSound()
    socketRef.current?.emit('order:decline', { orderId: incomingOrder.orderId })
    setIncomingOrder(null)
  }

  const advanceStatus = () => {
    const step = STATUS_STEPS.find(s => s.key === orderStatus)
    if (!step) return
    socketRef.current?.emit('order:status', { orderId: activeOrder.orderId, status: step.next })
    setOrderStatus(step.next)
    // completed — всё чистим, счётчик увеличивается в order:updated listener
    if (step.next === 'completed') {
      setActiveOrder(null)
      localStorage.removeItem('nurse_order')
      localStorage.removeItem('nurse_order_status')
    }
  }

  const logout = () => { localStorage.removeItem('token'); navigate('/login') }
  const currentStep = STATUS_STEPS.find(s => s.key === orderStatus) || STATUS_STEPS[0]

  return (
    <div style={{ minHeight: '100vh', background: '#060A12', color: 'white' }}>
      <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 0 }}>
        <div style={{ position: 'absolute', top: -100, right: -100, width: 500, height: 500, borderRadius: '50%', background: 'radial-gradient(circle,rgba(16,185,129,0.07) 0%,transparent 70%)' }} />
      </div>

      <div style={{ position: 'relative', zIndex: 1, maxWidth: 520, margin: '0 auto', padding: '0 20px 40px' }}>

        {/* Хедер */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '24px 0 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 38, height: 38, background: 'linear-gradient(135deg,#059669,#10B981)', borderRadius: 11, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>👩‍⚕️</div>
            <div>
              <div style={{ fontWeight: 900, fontSize: 15 }}>HamshiraGo</div>
              <div style={{ color: '#34D399', fontSize: 11, fontWeight: 600 }}>Медсестра</div>
            </div>
          </div>
          <button onClick={logout} style={{ padding: '8px 14px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, color: 'rgba(255,255,255,0.4)', fontSize: 12, cursor: 'pointer' }}>
            Выйти
          </button>
        </div>

        {/* Профиль */}
        {nurse && (
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
            style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 20, padding: 20, marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ width: 54, height: 54, borderRadius: 16, background: 'linear-gradient(135deg,#059669,#10B981)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, fontWeight: 900 }}>
                {nurse.name?.[0]}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 800, fontSize: 16 }}>{nurse.name}</div>
                <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12, marginTop: 2 }}>★ {nurse.rating} · {nurse.experience} лет опыта</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ color: '#34D399', fontWeight: 800, fontSize: 18 }}>{todayOrders}</div>
                <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: 11 }}>сегодня</div>
              </div>
            </div>
          </motion.div>
        )}

        {/* Кнопка дежурства */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} style={{ marginBottom: 20 }}>
          {!isOnDuty ? (
            <motion.button whileTap={{ scale: 0.97 }} onClick={toggleDuty} disabled={loading}
              style={{ width: '100%', padding: '20px', borderRadius: 20, border: 'none', background: loading ? 'rgba(255,255,255,0.05)' : 'linear-gradient(135deg,#059669,#10B981)', color: loading ? 'rgba(255,255,255,0.3)' : 'white', fontSize: 17, fontWeight: 900, cursor: loading ? 'not-allowed' : 'pointer', boxShadow: loading ? 'none' : '0 8px 32px rgba(16,185,129,0.35)' }}>
              {loading ? 'Получаем геолокацию...' : '🚀 Выйти на найм'}
            </motion.button>
          ) : (
            <div style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)', borderRadius: 20, padding: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                <motion.div animate={{ scale: [1, 1.4, 1], opacity: [1, 0.4, 1] }} transition={{ duration: 2, repeat: Infinity }}
                  style={{ width: 10, height: 10, borderRadius: '50%', background: '#10B981', boxShadow: '0 0 10px #10B981' }} />
                <span style={{ color: '#34D399', fontWeight: 800, fontSize: 15 }}>Вы в режиме ожидания</span>
              </div>
              <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13, marginBottom: 16 }}>Ожидаем входящие заказы рядом с вами...</p>
              <motion.button whileTap={{ scale: 0.97 }} onClick={toggleDuty}
                style={{ width: '100%', padding: '13px', borderRadius: 14, border: '1px solid rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.08)', color: '#FCA5A5', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
                Завершить смену
              </motion.button>
            </div>
          )}
          {gpsError && <p style={{ color: '#FCA5A5', fontSize: 13, marginTop: 10, textAlign: 'center' }}>{gpsError}</p>}
        </motion.div>

        {/* Активный заказ */}
        <AnimatePresence>
          {activeOrder && (
            <motion.div key="active" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }}
              style={{ background: 'rgba(255,255,255,0.03)', border: '1.5px solid rgba(59,130,246,0.3)', borderRadius: 20, padding: 20, marginBottom: 20 }}>
              <div style={{ color: '#60A5FA', fontSize: 12, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 14 }}>● Активный заказ</div>
              <div style={{ marginBottom: 16 }}>
                <div style={{ color: 'white', fontWeight: 800, fontSize: 16, marginBottom: 4 }}>{activeOrder.service?.name}</div>
                <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>📍 {activeOrder.client?.address}</div>
                <div style={{ color: '#10B981', fontSize: 13, fontWeight: 700, marginTop: 4 }}>
                  {activeOrder.service?.price?.toLocaleString()} сум · {activeOrder.distance} км
                </div>
              </div>

              <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
                {STATUS_STEPS.map((step, i) => {
                  const stepIdx = STATUS_STEPS.findIndex(s => s.key === orderStatus)
                  const done = i < stepIdx; const active = i === stepIdx
                  return (
                    <div key={step.key} style={{ flex: 1, textAlign: 'center' }}>
                      <div style={{ height: 4, borderRadius: 4, marginBottom: 5, background: done ? '#10B981' : active ? step.color : 'rgba(255,255,255,0.08)', transition: 'background 0.4s' }} />
                      <div style={{ color: active ? 'white' : done ? '#34D399' : 'rgba(255,255,255,0.2)', fontSize: 10, fontWeight: 600 }}>{step.label}</div>
                    </div>
                  )
                })}
              </div>

              {orderStatus !== 'completed' && (
                <motion.button whileTap={{ scale: 0.97 }} onClick={advanceStatus}
                  style={{ width: '100%', padding: '14px', borderRadius: 14, border: 'none', background: `linear-gradient(135deg,${currentStep.color},${currentStep.color}cc)`, color: 'white', fontSize: 15, fontWeight: 800, cursor: 'pointer', boxShadow: `0 6px 20px ${currentStep.color}40` }}>
                  {currentStep.btn}
                </motion.button>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {!isOnDuty && !activeOrder && (
          <div style={{ textAlign: 'center', padding: '30px 0', color: 'rgba(255,255,255,0.2)', fontSize: 14 }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>🏥</div>
            <p>Нажмите «Выйти на найм»,<br/>чтобы начать принимать заказы</p>
          </div>
        )}
      </div>

      {/* Модал входящего заказа */}
      <AnimatePresence>
        {incomingOrder && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 100, padding: 20 }}>
            <motion.div initial={{ y: 100, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 100, opacity: 0 }}
              style={{ width: '100%', maxWidth: 480, background: '#0F172A', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 24, padding: 28 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <span style={{ color: '#34D399', fontWeight: 700, fontSize: 13 }}>● Новый заказ</span>
                <div style={{ width: 44, height: 44, borderRadius: '50%', border: `3px solid ${countdown > 10 ? '#10B981' : '#EF4444'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: countdown > 10 ? '#34D399' : '#FCA5A5', fontWeight: 900, fontSize: 16 }}>
                  {countdown}
                </div>
              </div>

              <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 16, padding: 16, marginBottom: 20 }}>
                <div style={{ fontSize: 22, marginBottom: 8 }}>{incomingOrder.service?.icon}</div>
                <div style={{ color: 'white', fontWeight: 800, fontSize: 18, marginBottom: 6 }}>{incomingOrder.service?.name}</div>
                <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13, marginBottom: 4 }}>📍 {incomingOrder.client?.address}</div>
                <div style={{ display: 'flex', gap: 16, marginTop: 10 }}>
                  <span style={{ color: '#34D399', fontWeight: 700, fontSize: 14 }}>📏 {incomingOrder.distance} км</span>
                  <span style={{ color: '#60A5FA', fontWeight: 700, fontSize: 14 }}>⏱ ~{incomingOrder.eta} мин</span>
                  <span style={{ color: '#FBBF24', fontWeight: 700, fontSize: 14 }}>💰 {incomingOrder.service?.price?.toLocaleString()} сум</span>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 12 }}>
                <button onClick={declineOrder}
                  style={{ flex: 1, padding: '14px', borderRadius: 14, border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', color: 'rgba(255,255,255,0.5)', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
                  Отклонить
                </button>
                <motion.button whileTap={{ scale: 0.97 }} onClick={acceptOrder}
                  style={{ flex: 2, padding: '14px', borderRadius: 14, border: 'none', background: 'linear-gradient(135deg,#059669,#10B981)', color: 'white', fontSize: 15, fontWeight: 900, cursor: 'pointer', boxShadow: '0 6px 20px rgba(16,185,129,0.4)' }}>
                  ✓ Принять заказ
                </motion.button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
