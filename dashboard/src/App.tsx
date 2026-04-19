import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Nav } from '@/components/dashboard/nav';
import LivePage     from '@/pages/LivePage';
import DemoPage     from '@/pages/DemoPage';
import StatsPage    from '@/pages/StatsPage';
import SettingsPage from '@/pages/SettingsPage';

export default function App() {
  return (
    <BrowserRouter>
      <div className="flex h-screen overflow-hidden bg-background">
        <Nav />
        <main className="flex-1 overflow-y-auto">
          <Routes>
            <Route path="/"          element={<Navigate to="/live" replace />} />
            <Route path="/live"      element={<LivePage />} />
            <Route path="/demo"      element={<DemoPage />} />
            <Route path="/stats"     element={<StatsPage />} />
            <Route path="/settings"  element={<SettingsPage />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}
