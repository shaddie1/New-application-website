import { Section, SectionHeading } from '../layout';
import { UsersIcon } from '../icons';
import { TEAM } from '../../content/site';

/**
 * Team cards show the role always, and a name/photo only once real ones are
 * supplied in content/site.ts — an unnamed card is honest, an invented person
 * is not.
 */
export function Team() {
  if (TEAM.length === 0) return null;

  return (
    <Section id="team">
      <SectionHeading
        eyebrow="The team"
        title="The people behind the standard"
        lead="Cleaning is personal — you should know who runs the company you are letting into your space."
        align="center"
      />

      <ul className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-5">
        {TEAM.map((member) => (
          <li
            key={member.role}
            className="overflow-hidden rounded-xl border border-ink-border bg-ink-raised text-center"
          >
            <div className="flex aspect-square items-center justify-center bg-gradient-to-br from-ink-soft to-ink">
              {member.photo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={member.photo} alt={member.name ?? member.role} className="h-full w-full object-cover" />
              ) : (
                <UsersIcon className="h-9 w-9 text-gold/40" />
              )}
            </div>
            <div className="px-4 py-5">
              {member.name ? (
                <>
                  <p className="text-sm font-semibold text-text-on-dark">{member.name}</p>
                  <p className="mt-1 text-xs text-text-on-dark-muted">{member.role}</p>
                </>
              ) : (
                <p className="text-sm font-semibold text-text-on-dark">{member.role}</p>
              )}
            </div>
          </li>
        ))}
      </ul>
    </Section>
  );
}
