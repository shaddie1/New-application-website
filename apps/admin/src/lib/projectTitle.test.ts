import { describe, expect, it } from 'vitest';

import { pickService, titleSuggestions } from './projectTitle';

const services = [
  { code: 'residential', name: 'Residential' },
  { code: 'office', name: 'Office & commercial' },
  { code: 'post_build', name: 'Post-construction' },
  { code: 'ac_duct', name: 'AC & duct cleaning' },
];

describe('titleSuggestions', () => {
  it('shows every service while the title is empty', () => {
    expect(titleSuggestions(services, '')).toEqual(services);
    expect(titleSuggestions(services, '   ')).toEqual(services);
  });

  it('keeps the services whose name contains the typed text, ignoring case', () => {
    expect(titleSuggestions(services, 'POST').map((s) => s.code)).toEqual(['post_build']);
    expect(titleSuggestions(services, 'comm').map((s) => s.code)).toEqual(['office']);
    expect(titleSuggestions(services, ' & ').map((s) => s.code)).toEqual(['office', 'ac_duct']);
  });

  it('shows nothing once the title has detail after a service name', () => {
    expect(titleSuggestions(services, 'Post-construction – Riverside Block C')).toEqual([]);
  });
});

describe('pickService', () => {
  const form = { title: 'post', serviceLineCode: '', clientName: 'Amani' };

  it('sets the title to the service name and the Service line to match', () => {
    expect(pickService(form, services[2]!)).toEqual({
      title: 'Post-construction',
      serviceLineCode: 'post_build',
      clientName: 'Amani',
    });
  });

  it('replaces a Service line chosen earlier', () => {
    expect(pickService({ ...form, serviceLineCode: 'residential' }, services[1]!).serviceLineCode).toBe('office');
  });
});
