import { useEffect, useState } from 'react';

import { api } from '../api.js';
import { PRIORITY_LABELS, formatMinutes } from '../utils.js';

function Item({ item, active, onStart, onStop }) {
  const running = active?.task_id === item.id;
  return (
    <li className={`task ${running ? 'is-running' : ''}`}>
      <div className="task-main">
        <span className="task-title">{item.title}</span>
        <span className="chips">
          <span className={`chip p${item.priority}`}>{PRIORITY_LABELS[item.priority]}</span>
          {item.overdue && <span className="chip due-overdue">Overdue · {item.due_date}</span>}
          {!item.overdue && item.due_date && <span className="chip">Due {item.due_date}</span>}
          <span className="chip">{formatMinutes(item.minutes)}{item.estimated ? '' : ' (default)'}</span>
        </span>
      </div>
      {running
        ? <button className="stop small" onClick={onStop}>Stop</button>
        : <button className="small" onClick={() => onStart(item.id)}>Start</button>}
    </li>
  );
}

export default function Plan({ active, onStart, onStop }) {
  const [hours, setHours] = useState(4);
  const [plan, setPlan] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    const id = setTimeout(async () => {
      try {
        const p = await api.plan(hours * 60);
        if (!cancelled) { setPlan(p); setError(''); }
      } catch (e) {
        if (!cancelled) setError(e.message);
      }
    }, 150);
    return () => { cancelled = true; clearTimeout(id); };
  }, [hours]);

  return (
    <section>
      <div className="card plan-head">
        <label>
          Time available today: <strong>{hours}h</strong>
          <input type="range" min="1" max="10" step="0.5" value={hours} onChange={(e) => setHours(Number(e.target.value))} />
        </label>
        {plan && (
          <p className="muted">
            {formatMinutes(plan.plannedMinutes)} planned of {formatMinutes(plan.availableMinutes)} · ordered by overdue, due today, then priority
          </p>
        )}
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      {plan && plan.planned.length === 0 && <p className="empty">Nothing to plan. Add tasks or free up more time.</p>}
      {plan && plan.planned.length > 0 && (
        <ol className="tasks numbered">
          {plan.planned.map((i) => <Item key={i.id} item={i} active={active} onStart={onStart} onStop={onStop} />)}
        </ol>
      )}
      {plan && plan.overflow.length > 0 && (
        <>
          <h2 className="sub">Doesn't fit today</h2>
          <ul className="tasks muted-list">
            {plan.overflow.map((i) => <Item key={i.id} item={i} active={active} onStart={onStart} onStop={onStop} />)}
          </ul>
        </>
      )}
    </section>
  );
}
