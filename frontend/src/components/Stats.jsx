import { useEffect, useState } from 'react';

import { api } from '../api.js';
import { formatMinutes } from '../utils.js';

const weekday = (iso) => new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short' });

export default function Stats({ refreshKey }) {
  const [days, setDays] = useState(7);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    api.stats(days)
      .then((d) => { if (!cancelled) { setData(d); setError(''); } })
      .catch((e) => { if (!cancelled) setError(e.message); });
    return () => { cancelled = true; };
  }, [days, refreshKey]);

  if (error) return <p className="error" role="alert">{error}</p>;
  if (!data) return <p className="empty">Loading…</p>;

  const max = Math.max(30, ...data.days.map((d) => d.trackedMinutes));

  return (
    <section>
      <div className="filters">
        {[7, 14, 30].map((n) => (
          <button key={n} className={`pill ${days === n ? 'active' : ''}`} onClick={() => setDays(n)}>{n} days</button>
        ))}
      </div>

      <div className="kpis">
        <div className="card kpi"><span className="kpi-value">{formatMinutes(data.totals.trackedMinutes)}</span><span className="muted">tracked</span></div>
        <div className="card kpi"><span className="kpi-value">{data.totals.completedTasks}</span><span className="muted">tasks completed</span></div>
      </div>

      <div className="card">
        <h2 className="sub">Time tracked per day</h2>
        <div className="bars" role="img" aria-label="Bar chart of minutes tracked per day">
          {data.days.map((d) => (
            <div className="bar-col" key={d.date} title={`${d.date}: ${formatMinutes(d.trackedMinutes)}, ${d.completedTasks} done`}>
              <span className="bar-val">{d.trackedMinutes ? formatMinutes(d.trackedMinutes) : ''}</span>
              <div className="bar" style={{ height: `${(d.trackedMinutes / max) * 100}%` }} />
              <span className="bar-label">{days <= 14 ? weekday(d.date) : d.date.slice(5)}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <h2 className="sub">Where the time went</h2>
        {data.totals.topTasks.length === 0 ? (
          <p className="empty">Start a timer on a task to see this.</p>
        ) : (
          <ul className="toplist">
            {data.totals.topTasks.map((t) => (
              <li key={t.taskId}><span>{t.title}</span><strong>{formatMinutes(t.minutes)}</strong></li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
