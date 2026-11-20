/** A service from the catalog, as the New project form's title list shows it. */
export type TitleService = { code: string; name: string };

/**
 * The services the title list shows for what has been typed so far. An empty
 * box shows every service. Otherwise only services whose name contains the
 * typed text, ignoring case, so "post" finds "Post-construction". Once the
 * title has detail added after a service name, nothing matches and the list closes.
 */
export function titleSuggestions(services: TitleService[], typed: string): TitleService[] {
  const needle = typed.trim().toLowerCase();
  if (!needle) return services;
  return services.filter((s) => s.name.toLowerCase().includes(needle));
}

/**
 * The form after a service is picked from the title list: the title becomes the
 * service's name, ready for the site to be typed after it, and the Service line
 * is set to match.
 */
export function pickService<F extends { title: string; serviceLineCode: string }>(form: F, service: TitleService): F {
  return { ...form, title: service.name, serviceLineCode: service.code };
}
