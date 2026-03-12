import { useEffect, useState } from 'react';

export default function SwarmPage() {
  const [data, setData] = useState(null);
  useEffect(() => {
    fetch('/api/swarm/stats').then(r => r.json()).then(setData).catch(() => {});
    const t = setInterval(() => fetch('/api/swarm/stats').then(r => r.json()).then(setData).catch(() => {}), 5000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="p-6">
      <h2 className="text-xl font-bold mb-4 text-ctp-text">Swarm Nodes</h2>
      {data ? (
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-ctp-surface0 rounded-lg p-4">
            <div className="text-2xl font-bold text-ctp-green">{data.up}</div>
            <div className="text-ctp-subtext0 text-sm">Nœuds actifs</div>
          </div>
          <div className="bg-ctp-surface0 rounded-lg p-4">
            <div className="text-2xl font-bold text-ctp-red">{data.down}</div>
            <div className="text-ctp-subtext0 text-sm">Nœuds hors ligne</div>
          </div>
          <div className="bg-ctp-surface0 rounded-lg p-4">
            <div className="text-2xl font-bold text-ctp-blue">{data.activeJobs}</div>
            <div className="text-ctp-subtext0 text-sm">Jobs actifs</div>
          </div>
        </div>
      ) : <div className="text-ctp-subtext0">Chargement...</div>}
    </div>
  );
}
