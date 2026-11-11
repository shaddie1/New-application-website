import { describe, expect, it } from 'vitest';

import { suggester, type JobClient, type ProjectClient } from './suggest.js';

const project = (id: string, over: object = {}) => ({
  id, title: `Project ${id}`, clientName: null, clientPhone: null, stage: 'IN_PROGRESS' as const, ...over,
});
const noClient = { clientName: null, clientPhone: null };
const suggestProjects = (job: JobClient, projects: ProjectClient[]) => suggester(projects)(job);

describe('suggester', () => {
  it('matches a phone typed with spaces to the same number with a country code', () => {
    const r = suggestProjects({ clientName: null, clientPhone: '0712 345 678' }, [project('a', { clientPhone: '+254712345678' })]);

    expect(r.matches).toEqual([{ projectId: 'a', title: 'Project a', clientName: null, stage: 'IN_PROGRESS', by: 'PHONE' }]);
  });

  it('matches names after trimming and ignoring case', () => {
    const r = suggestProjects({ clientName: ' Karen Heights ', clientPhone: null }, [project('a', { clientName: 'karen heights' })]);

    expect(r.matches.map((m) => [m.projectId, m.by])).toEqual([['a', 'NAME']]);
  });

  it('does not match a job and a project that both have no phone and no name', () => {
    const r = suggestProjects({ clientName: '  ', clientPhone: '' }, [project('a', { clientName: '', clientPhone: null })]);

    expect(r).toEqual({ matches: [], suggestedProjectId: null });
  });

  it('suggests the one project that matches', () => {
    const r = suggestProjects({ clientName: 'Acme', clientPhone: null }, [project('a', { clientName: 'Acme' }), project('b', { clientName: 'Other' })]);

    expect(r.suggestedProjectId).toBe('a');
  });

  it('lists a phone match before a name match and suggests neither when there are two', () => {
    const r = suggestProjects({ clientName: 'Acme', clientPhone: '0712345678' }, [
      project('byName', { clientName: 'ACME' }),
      project('byPhone', { clientPhone: '+254 712 345 678' }),
    ]);

    expect(r.matches.map((m) => [m.projectId, m.by])).toEqual([['byPhone', 'PHONE'], ['byName', 'NAME']]);
    expect(r.suggestedProjectId).toBeNull();
  });

  it('lists a project in an open stage before a completed one', () => {
    const r = suggestProjects({ clientName: 'Acme', clientPhone: null }, [
      project('done', { clientName: 'Acme', stage: 'COMPLETE' }),
      project('open', { clientName: 'Acme', stage: 'SNAGGING' }),
    ]);

    expect(r.matches.map((m) => m.projectId)).toEqual(['open', 'done']);
  });

  it('returns no matches and no suggestion for a job that matches nothing', () => {
    const r = suggestProjects({ clientName: 'Nobody', clientPhone: '0700000001' }, [project('a', { clientName: 'Acme', clientPhone: '0711111111' })]);

    expect(r).toEqual({ matches: [], suggestedProjectId: null });
    expect(suggestProjects(noClient, [])).toEqual({ matches: [], suggestedProjectId: null });
  });
});
