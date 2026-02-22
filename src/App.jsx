import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import NurseLogin from './pages/NurseLogin'
import NurseDashboard from './pages/NurseDashboard'

function NurseRoute({ children }) {
  try {
    const token = localStorage.getItem('token')
    if (!token) return <Navigate to="/login" />
    const payload = JSON.parse(atob(token.split('.')[1]))
    if (payload.role !== 'nurse') return <Navigate to="/login" />
    return children
  } catch {
    return <Navigate to="/login" />
  }
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/login" />} />
        <Route path="/login" element={<NurseLogin />} />
        <Route path="/dashboard" element={<NurseRoute><NurseDashboard /></NurseRoute>} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
