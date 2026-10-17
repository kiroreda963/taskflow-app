import { useCallback, useEffect, useState } from 'react';

import { api, auth, setUnauthorizedHandler } from './api.js';
import AuthForm from './components/AuthForm.jsx';
import Plan from './components/Plan.jsx';
import Stats from './components/Stats.jsx';
import TaskList from './components/TaskList.jsx';
import TimerBar from './components/TimerBar.jsx';

const TABS = [
  { id: 'tasks', label: 'Tasks' },
  { id: 'plan', label: 'Plan my day' },
  { id: 'stats', label: 'Stats' },
];

export default function App() {
  const [loggedIn, setLoggedIn] = useState(Boolean(auth.token));
  const [tab, setTab] = useState('tasks');
  const [tasks, setTasks] = useState([]);
  const [active, setActive] = useState(null);
  const [error, setError] = useState('');

  const logout = useCallback(() => {
    auth.clear();
    setTasks([]);
    setActive(null);
    setLoggedIn(false);
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(logout);
  }, [logout]);

  const refresh = useCallback(async () => {
    try {
      const [t, timer] = await Promise.all([api.listTasks(), api.activeTimer()]);
      setTasks(t);
      setActive(timer.active);
      setError('');
    } catch (e) {
      setError(e.message);
    }
  }, []);

  useEffect(() => {
    if (loggedIn) refresh();
  }, [loggedIn, refresh]);

  const startTimer = async (taskId) => {
    try {
      await api.startTimer(taskId);
      await refresh();
    } catch (e) {
      setError(e.message);
    }
  };

  const stopTimer = async () => {
    try {
      await api.stopTimer();
      await refresh();
    } catch (e) {
      setError(e.message);
    }
  };

  if (!loggedIn) {
    return <AuthForm onAuthed={() => setLoggedIn(true)} />;
  }

  return (
    <div className="shell">
      <header className="topbar">
        <h1>Taskflow</h1>
        <nav aria-label="Sections">
          {TABS.map((t) => (
            <button
              key={t.id}
              className={`tab ${tab === t.id ? 'active' : ''}`}
              aria-current={tab === t.id ? 'page' : undefined}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </nav>
        <button className="ghost" onClick={logout}>Log out</button>
      </header>

      <TimerBar active={active} onStop={stopTimer} />
      {error && <p className="error" role="alert">{error}</p>}

      <main>
        {tab === 'tasks' && (
          <TaskList tasks={tasks} active={active} onChange={refresh} onStart={startTimer} onStop={stopTimer} />
        )}
        {tab === 'plan' && <Plan active={active} onStart={startTimer} onStop={stopTimer} />}
        {tab === 'stats' && <Stats refreshKey={`${tasks.length}-${active?.entry_id ?? 0}`} />}
      </main>
    </div>
  );
}
