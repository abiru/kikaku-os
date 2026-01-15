import { Link, Route, Routes, useLocation, useNavigate } from 'react-router';
import DailyClosePage from './pages/reports/DailyClosePage';
import LedgerEntriesPage from './pages/accounting/LedgerEntriesPage';
import InboxPage from './pages/automation/InboxPage';
import SeedPage from './pages/dev/SeedPage';
import AiQueryPage from './pages/ai/AiQueryPage';
import { useEffect } from 'react';

const NavLink = ({ to, label }: { to: string; label: string }) => {
  const location = useLocation();
  const active = location.pathname === to;
  return (
    <Link
      to={to}
      className={`px-4 py-2 rounded-xl border ${active ? 'bg-black text-white border-black' : 'border-transparent text-zinc-700 hover:bg-zinc-200'}`}
    >
      {label}
    </Link>
  );
};

const RequireAdminKey = () => {
  const navigate = useNavigate();
  useEffect(() => {
    if (import.meta.env.MODE === 'test') return;
    const key = localStorage.getItem('adminKey');
    if (!key) {
      const input = window.prompt('Enter admin API key');
      if (input) {
        localStorage.setItem('adminKey', input);
      } else {
        navigate('/', { replace: true });
      }
    }
  }, [navigate]);
  return null;
};

const App = ({ children }: { children: React.ReactNode }) => {
  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900">
      <RequireAdminKey />
      <header className="sticky top-0 z-10 backdrop-blur bg-white/70 border-b border-zinc-200">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="text-xl font-semibold">Led Kikaku OS</div>
          <nav className="flex gap-2">
            <NavLink to="/reports" label="Daily Close" />
            <NavLink to="/ledger" label="Ledger" />
            <NavLink to="/inbox" label="Inbox" />
            <NavLink to="/ai" label="AI" />
            <NavLink to="/dev-tools/seed" label="Dev Tools" />
          </nav>
        </div>
      </header>
      <main className="max-w-6xl mx-auto px-6 py-8">
        <Routes>
          <Route path="/" element={<DailyClosePage />} />
          <Route path="/reports" element={<DailyClosePage />} />
          <Route path="/ledger" element={<LedgerEntriesPage />} />
          <Route path="/inbox" element={<InboxPage />} />
          <Route path="/ai" element={<AiQueryPage />} />
          <Route path="/dev-tools/seed" element={<SeedPage />} />
        </Routes>
        {children}
      </main>
    </div>
  );
};

export default App;
