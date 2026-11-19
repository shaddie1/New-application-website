/**
 * The Dashboard's greeting: "Good afternoon, Test". The time of day is
 * Nairobi's, wherever the browser is. Morning runs from 05:00, afternoon from
 * noon and evening from 17:00 through the night.
 */
export function greeting(now: Date, fullName: string | undefined): string {
  const hour = Number(
    now.toLocaleTimeString('en-GB', { timeZone: 'Africa/Nairobi', hour: '2-digit', hourCycle: 'h23' }),
  );
  const partOfDay = hour >= 5 && hour < 12 ? 'morning' : hour >= 12 && hour < 17 ? 'afternoon' : 'evening';
  const firstName = (fullName ?? '').trim().split(/\s+/)[0];
  return firstName ? `Good ${partOfDay}, ${firstName}` : `Good ${partOfDay}`;
}
