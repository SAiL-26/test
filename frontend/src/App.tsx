import { lazy, Suspense } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider } from './auth/AuthContext'
import ProtectedRoute from './components/ProtectedRoute'
import Layout from './components/Layout'
import Login from './pages/Login'
import Intro from './pages/Intro'
import PatientList from './pages/PatientList'
import PatientDetail from './pages/PatientDetail'
import PatientApp from './pages/PatientApp'
import ReportPreview from './pages/ReportPreview'

// Lazy-load every route that transitively pulls Plotly (~1.4 MB gzipped)
// or three.js so login + the patient list don't fetch them up front.
// TimelineView / ResearchLab / PipelineWizard all import PlotlyChart, and
// Runs / Eval indirectly fan into wave components — splitting them keeps
// the initial JS payload under ~200 KB.
const ScanViewer       = lazy(() => import('./pages/ScanViewer'))
const StoryMode        = lazy(() => import('./pages/StoryMode'))
const CompareView      = lazy(() => import('./pages/CompareView'))
const CompareWorkspace = lazy(() => import('./pages/CompareWorkspace'))
const PipelineWizard   = lazy(() => import('./pages/PipelineWizard'))
const ResearchLab      = lazy(() => import('./pages/ResearchLab'))
const TimelineView     = lazy(() => import('./pages/TimelineView'))
const Runs             = lazy(() => import('./pages/Runs'))
const Eval             = lazy(() => import('./pages/Eval'))

const qc = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 1 } },
})

export default function App() {
  return (
    <QueryClientProvider client={qc}>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />

            {/* Patient mobile — standalone (no Layout chrome) */}
            <Route path="/m" element={<ProtectedRoute><PatientApp /></ProtectedRoute>} />
            <Route path="/m/:patientId" element={<ProtectedRoute><PatientApp /></ProtectedRoute>} />

            {/* Intro — editorial cover, no Layout chrome */}
            <Route path="/intro" element={<ProtectedRoute><Intro /></ProtectedRoute>} />

            {/* Report preview — A4 print surface, no Layout chrome */}
            <Route path="/scans/:id/report" element={<ProtectedRoute><ReportPreview /></ProtectedRoute>} />

            {/* Main app — Layout with NavRail */}
            <Route
              element={
                <ProtectedRoute>
                  <Layout />
                </ProtectedRoute>
              }
            >
              <Route index element={<PatientList />} />
              <Route path="patients/:id" element={<PatientDetail />} />
              <Route path="patients/:id/timeline" element={<Lazy><TimelineView /></Lazy>} />
              <Route path="patients/:id/compare" element={<Lazy><CompareView /></Lazy>} />
              <Route path="scans/new" element={<Lazy><PipelineWizard /></Lazy>} />
              <Route path="scans/:id" element={<Lazy><ScanViewer /></Lazy>} />
              <Route path="scans/:id/story" element={<Lazy><StoryMode /></Lazy>} />
              <Route path="runs" element={<Lazy><Runs /></Lazy>} />
              <Route path="eval" element={<Lazy><Eval /></Lazy>} />
              <Route path="lab" element={<Lazy><ResearchLab /></Lazy>} />
              <Route path="compare" element={<Lazy><CompareWorkspace /></Lazy>} />
            </Route>

            <Route path="*" element={<Navigate to="/intro" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  )
}

function Lazy({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<RouteSkeleton />}>
      {children}
    </Suspense>
  )
}

/** Quick skeleton shown while a lazy route chunk is in flight. Three
 *  rectangles roughly mimic the hero-strip + two-column workspace shape
 *  that most routes settle into, so the layout doesn't jump on resolve. */
function RouteSkeleton() {
  return (
    <div className="grid h-full gap-3 p-3 animate-[fade-in_0.15s_ease-out_both]">
      <div className="skeleton h-[110px] w-full rounded-[14px]" />
      <div className="grid min-h-0 grid-cols-1 gap-3 xl:grid-cols-2">
        <div className="skeleton min-h-[340px] rounded-[14px]" />
        <div className="skeleton min-h-[340px] rounded-[14px]" />
      </div>
    </div>
  )
}
