'use client';

import { useState } from 'react';

import { useRequireAdmin } from '../../../src/lib/auth';
import { canViewProbation } from '../../../src/lib/roles';
import { MembersPanel } from './MembersPanel';
import { ProbationPanel } from './ProbationPanel';

const tab = (on: boolean) =>
  `border-b-2 px-4 py-2 text-sm ${on ? 'border-gold-deep font-medium text-gold-deep' : 'border-transparent text-charcoal-muted hover:text-charcoal'}`;

/**
 * Team: the owner's member list, and the probation tracker for the COO, the
 * CEO and the two trainees. Whoever cannot see a tab does not get it.
 */
export default function TeamPage() {
  const session = useRequireAdmin();
  const [active, setActive] = useState<'members' | 'probation' | null>(null);

  if (session === undefined) return <div className="text-charcoal-muted">Loading…</div>;
  if (!session) return null;

  const isOwner = session.user.isOwner === true;
  const probation = canViewProbation(session);
  const current = active ?? (isOwner ? 'members' : 'probation');

  if (!isOwner && !probation) {
    return <div className="rounded-lg bg-danger/10 px-4 py-3 text-sm text-danger">Only the account owner can manage the team.</div>;
  }

  return (
    <div>
      <h1 className="text-3xl" style={{ fontFamily: 'Georgia, serif' }}>Team</h1>
      <div className="mb-6 mt-4 flex flex-wrap gap-1 border-b border-line">
        {isOwner && <button onClick={() => setActive('members')} className={tab(current === 'members')}>Members</button>}
        {probation && <button onClick={() => setActive('probation')} className={tab(current === 'probation')}>Probation</button>}
      </div>
      {current === 'members' && isOwner ? <MembersPanel /> : <ProbationPanel />}
    </div>
  );
}
