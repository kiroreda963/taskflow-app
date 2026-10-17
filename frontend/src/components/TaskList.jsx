import { useMemo, useState } from 'react';

import { api } from '../api.js';
import { PRIORITY_LABELS, dueState, formatMinutes, todayString } from '../utils.js';

const FILTERS = [
  { id: 'open', label: 'Open' },
  { id: 'done', label: 'Done' },
  { id: 'all', label: 'All' },
];

function NewTask({ onCreated }) {
  const [title, setTitle] = useState('');
  const [priority, setPriority] = useState(2);
  const [due, setDue] = useState('');
  const [estimate, setEstimate] = useState('');
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await api.createTask({
        title,
        priority: Number(priority),
        due_date: due || null,
        estimate_min: estimate ? Number(estimate) : null,
      });
      setTitle('');
      setDue('');
      setEstimate('');
      onCreated();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <form className="card new-task" onSubmit={submit}>
      <input
        className="grow"
        placeholder="What needs doing?"
        aria-label="Task title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        maxLength={200}
        required
      />
      <select aria-label="Priority" value={priority} onChange={(e) => setPriority(e.target.value)}>
        {Object.entries(PRIORITY_LABELS).map(([v, l]) => (
          <option key={v} value={v}>{l}</option>
        ))}
      </select>
      <input type="date" aria-label="Due date" value={due} onChange={(e) => setDue(e.target.value)} />
      <input
        type="number"
        min="1"
        max="1440"
        placeholder="Est. min"
        aria-label="Estimate in minutes"
        value={estimate}
        onChange={(e) => setEstimate(e.target.value)}
        className="narrow"
      />
      <button className="primary">Add</button>
      {error && <p className="error full" role="alert">{error}</p>}
    </form>
  );
}

function TaskRow({ task, running, onChange, onStart, onStop }) {
  const today = todayString();
  const state = task.status === 'done' ? null : dueState(task.due_date, today);
  const done = task.status === 'done';

  const toggle = async () => {
    await api.updateTask(task.id, { status: done ? 'todo' : 'done' });
    onChange();
  };
  const remove = async () => {
    await api.deleteTask(task.id);
    onChange();
  };

  return (
    <li className={`task ${done ? 'is-done' : ''} ${running ? 'is-running' : ''}`}>
      <input type="checkbox" checked={done} onChange={toggle} aria-label={`Mark "${task.title}" ${done ? 'not done' : 'done'}`} />
      <div className="task-main">
        <span className="task-title">{task.title}</span>
        <span className="chips">
          <span className={`chip p${task.priority}`}>{PRIORITY_LABELS[task.priority]}</span>
          {task.due_date && <span className={`chip due-${state || 'none'}`}>{state === 'overdue' ? 'Overdue · ' : state === 'today' ? 'Today · ' : ''}{task.due_date}</span>}
          {task.estimate_min && <span className="chip">Est. {formatMinutes(task.estimate_min)}</span>}
          {task.tracked_seconds > 0 && <span className="chip">Tracked {formatMinutes(task.tracked_seconds / 60)}</span>}
        </span>
      </div>
      {!done && (running
        ? <button className="stop small" onClick={onStop}>Stop</button>
        : <button className="small" onClick={() => onStart(task.id)}>Start</button>)}
      <button className="ghost small danger" onClick={remove} aria-label={`Delete "${task.title}"`}>✕</button>
    </li>
  );
}

export default function TaskList({ tasks, active, onChange, onStart, onStop }) {
  const [filter, setFilter] = useState('open');

  const visible = useMemo(
    () => tasks.filter((t) => (filter === 'all' ? true : filter === 'done' ? t.status === 'done' : t.status !== 'done')),
    [tasks, filter],
  );

  return (
    <section>
      <NewTask onCreated={onChange} />
      <div className="filters" role="tablist" aria-label="Task filter">
        {FILTERS.map((f) => (
          <button key={f.id} role="tab" aria-selected={filter === f.id} className={`pill ${filter === f.id ? 'active' : ''}`} onClick={() => setFilter(f.id)}>
            {f.label}
          </button>
        ))}
      </div>
      {visible.length === 0 ? (
        <p className="empty">{filter === 'done' ? 'Nothing finished yet.' : 'No tasks here. Add one above.'}</p>
      ) : (
        <ul className="tasks">
          {visible.map((t) => (
            <TaskRow
              key={t.id}
              task={t}
              running={active?.task_id === t.id}
              onChange={onChange}
              onStart={onStart}
              onStop={onStop}
            />
          ))}
        </ul>
      )}
    </section>
  );
}
