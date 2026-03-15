'use client';

/**
 * components/HitlBadge.tsx — Badge rouge indiquant le nombre de demandes HITL en attente.
 *
 * Retourne null si aucune demande n'est en attente (pas de rendu inutile).
 */

import React from 'react';
import { useChimeraStore } from '../store/chimera';

export function HitlBadge() {
  const count = useChimeraStore((s) => s.hitlRequests.length);

  if (count === 0) return null;

  return (
    <span style={{
      display:        'inline-flex',
      alignItems:     'center',
      justifyContent: 'center',
      minWidth:       '18px',
      height:         '18px',
      padding:        '0 5px',
      background:     '#ef4444',
      color:          'white',
      fontSize:       '10px',
      fontWeight:     700,
      borderRadius:   '999px',
      lineHeight:     1,
      verticalAlign:  'middle',
    }}>
      {count}
    </span>
  );
}
