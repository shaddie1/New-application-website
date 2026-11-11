/**
 * Which projects could a job not yet sorted belong to? Matches on the client's
 * phone (last nine digits) or name (trimmed, any case). Pure: no database.
 */
import type { ProjectMatchDto, ProjectStage } from '@onyxhawk/types';

export interface JobClient {
  clientName: string | null;
  clientPhone: string | null;
}

export interface ProjectClient extends JobClient {
  id: string;
  title: string;
  stage: ProjectStage;
}

const lastNine = (phone: string | null) => {
  const digits = (phone ?? '').replace(/\D/g, '');
  return digits.length >= 9 ? digits.slice(-9) : null;
};
const nameKey = (name: string | null) => (name ?? '').trim().toLowerCase() || null;

const isOpen = (stage: ProjectStage) => stage !== 'COMPLETE' && stage !== 'CANCELLED';

export function suggestProjects(job: JobClient, projects: ProjectClient[]): { matches: ProjectMatchDto[]; suggestedProjectId: string | null } {
  const phone = lastNine(job.clientPhone);
  const name = nameKey(job.clientName);

  const found = projects.flatMap((p) => {
    const by = phone !== null && lastNine(p.clientPhone) === phone ? 'PHONE' as const
      : name !== null && nameKey(p.clientName) === name ? 'NAME' as const
      : null;
    return by ? [{ projectId: p.id, title: p.title, clientName: p.clientName, stage: p.stage, by }] : [];
  });

  // Array.prototype.sort is stable, so equal rows keep the input order.
  const rank = (m: ProjectMatchDto) => (m.by === 'PHONE' ? 0 : 2) + (isOpen(m.stage) ? 0 : 1);
  const matches = found.sort((a, b) => rank(a) - rank(b));

  return { matches, suggestedProjectId: matches.length === 1 ? matches[0]!.projectId : null };
}
