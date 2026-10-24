import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useEffect } from 'react'
import Login from './pages/Login'
import PortalHome from './pages/PortalHome'
import InfoPage, { INFO } from './pages/InfoPage'
import { useApp } from './store'
import { ROLE_HOME, type Role } from './auth/directory'
import InstDashboard from './inst/pages/Dashboard'
import InstUpload from './inst/pages/Upload'
import InstLedger from './inst/pages/Ledger'
import InstSubmit from './inst/pages/Submit'
import AicteOverview from './aicte/pages/Overview'
import AicteAlerts from './aicte/pages/Alerts'
import AicteRings from './aicte/pages/Rings'
import AicteReports from './aicte/pages/Reports'
import StudentRecord from './student/pages/Record'
import StudentRequests from './student/pages/Requests'
import StudentLog from './student/pages/Log'
import VerifierVerify from './verifier/pages/Verify'
import VerifierRequests from './verifier/pages/Requests'
import Certificate from './pages/Certificate'

const INST: Role[] = ['inst_admin', 'inst_operator']

function RequireRole({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const account = useApp((s) => s.account)
  const location = useLocation()
  if (!account) return <Navigate to="/" replace state={{ from: location.pathname }} />
  if (!roles.includes(account.role)) return <Navigate to={ROLE_HOME[account.role]} replace />
  return <>{children}</>
}

function LoginOrHome() {
  const account = useApp((s) => s.account)
  return account ? <Navigate to={ROLE_HOME[account.role]} replace /> : <Login />
}

export default function App() {
  const { textSize, lang } = useApp()
  useEffect(() => {
    document.documentElement.style.fontSize = textSize === 'sm' ? '14px' : textSize === 'lg' ? '18px' : '16px'
    document.documentElement.lang = lang
  }, [textSize, lang])

  return (
    <Routes>
      <Route path="/" element={<LoginOrHome />} />
      {(Object.keys(INFO) as (keyof typeof INFO)[]).map((id) => (
        <Route key={id} path={`/${id}`} element={<InfoPage id={id} />} />
      ))}

      <Route path="/aicte" element={<RequireRole roles={['aicte_bureau']}><AicteOverview /></RequireRole>} />
      <Route path="/aicte/alerts" element={<RequireRole roles={['aicte_bureau']}><AicteAlerts /></RequireRole>} />
      <Route path="/aicte/rings" element={<RequireRole roles={['aicte_bureau']}><AicteRings /></RequireRole>} />
      <Route path="/aicte/reports" element={<RequireRole roles={['aicte_bureau']}><AicteReports /></RequireRole>} />
      <Route path="/aicte/region" element={<RequireRole roles={['aicte_regional']}><PortalHome /></RequireRole>} />
      <Route path="/aicte/admin" element={<RequireRole roles={['aicte_admin']}><PortalHome /></RequireRole>} />
      <Route path="/inst" element={<RequireRole roles={INST}><InstDashboard /></RequireRole>} />
      <Route path="/inst/upload" element={<RequireRole roles={INST}><InstUpload /></RequireRole>} />
      <Route path="/inst/ledger" element={<RequireRole roles={INST}><InstLedger /></RequireRole>} />
      <Route path="/inst/submit" element={<RequireRole roles={INST}><InstSubmit /></RequireRole>} />
      <Route path="/inst/*" element={<Navigate to="/inst" replace />} />
      <Route path="/student" element={<RequireRole roles={['student']}><StudentRecord /></RequireRole>} />
      <Route path="/student/requests" element={<RequireRole roles={['student']}><StudentRequests /></RequireRole>} />
      <Route path="/student/log" element={<RequireRole roles={['student']}><StudentLog /></RequireRole>} />
      <Route path="/verify" element={<RequireRole roles={['verifier']}><VerifierVerify /></RequireRole>} />
      <Route path="/verify/requests" element={<RequireRole roles={['verifier']}><VerifierRequests /></RequireRole>} />
      <Route path="/certificate/:id" element={<Certificate />} />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
