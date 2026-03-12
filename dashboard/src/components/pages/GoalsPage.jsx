import { useEffect, useState } from 'react';

export default function GoalsPage() {
  const [goals, setGoals] = useState([]);
  const [input, setInput] = useState('');
  const [priority, setPriority] = useState(5);

  const load = () => fetch('/api/goals').then(r => r.json()).then(d => setGoals(d.goals || [])).catch(() => {});
  useEffect(() => { load(); }, []);

  const addGoal = async () => {
    if (!input.trim()) return;
    await fetch('/api/goals', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ description: input, priority }) });
    setInput(''); load();
  };

  const deleteGoal = async (id) => {
    await fetch(`/api/goals/${id}`, { method: 'DELETE' });
    load();
  };

  const statusColor = { pending: 'ctp-yellow', active: 'ctp-blue', completed: 'ctp-green', failed: 'ctp-red' };

  return (
    <div className="p-6">
      <h2 className="text-xl font-bold mb-4 text-ctp-text">Objectifs</h2>
      <div className="flex gap-2 mb-6">
        <input value={input} onChange={e => setInput(e.target.value)} placeholder="Nouvel objectif..." className="flex-1 bg-ctp-surface0 text-ctp-text rounded px-3 py-2 text-sm" />
        <input type="number" value={priority} onChange={e => setPriority(+e.target.value)} min={1} max={10} className="w-16 bg-ctp-surface0 text-ctp-text rounded px-2 py-2 text-sm text-center" />
        <button onClick={addGoal} className="bg-ctp-blue text-ctp-base px-4 py-2 rounded text-sm font-medium">Ajouter</button>
      </div>
      <div className="space-y-2">
        {goals.map(g => (
          <div key={g.id} className="bg-ctp-surface0 rounded-lg p-3 flex items-center justify-between">
            <div>
              <span className={`text-xs px-2 py-0.5 rounded mr-2 bg-${statusColor[g.status] || 'ctp-surface1'} text-ctp-base`}>{g.status}</span>
              <span className="text-ctp-text text-sm">{g.description}</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-ctp-subtext0 text-xs">P{g.priority}</span>
              <button onClick={() => deleteGoal(g.id)} className="text-ctp-red text-xs hover:opacity-80">✕</button>
            </div>
          </div>
        ))}
        {goals.length === 0 && <div className="text-ctp-subtext0 text-sm">Aucun objectif défini.</div>}
      </div>
    </div>
  );
}
