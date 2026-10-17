import { useEffect, useState } from 'react';

import { formatClock } from '../utils.js';

export default function TimerBar({ active, onStop }) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!active) return undefined;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [active]);

  if (!active) return null;
  const elapsed = (now - new Date(active.started_at).getTime()) / 1000;

  return (
    <div className="timerbar" role="status">
      <span className="pulse" aria-hidden="true" />
      <span className="timer-title">{active.title}</span>
      <span className="timer-clock">{formatClock(elapsed)}</span>
      <button className="stop" onClick={onStop}>Stop</button>
    </div>
  );
}
