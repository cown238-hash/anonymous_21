/**
 * Calendar maths for the age gate.
 *
 * Kept free of Express and Prisma so both the route and the middleware — and a
 * test — can share the same definition of "old enough", and so the rule can be
 * reasoned about without a request in hand.
 */

export interface BirthDate {
  year: number;
  month: number;
  day: number;
}

/** No plausible visitor was born before this, and it bounds the year dropdown. */
export const MIN_BIRTH_YEAR = 1900;

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Parses `YYYY-MM-DD`, rejecting impossible dates such as `2025-02-30`.
 *
 * A plain `new Date(string)` would quietly roll those over to the 2nd of March,
 * which would let someone shift their birthday by a day every time a month is
 * short — enough, over enough attempts, to clear a fixed threshold early.
 */
export function parseBirthDate(input: string): BirthDate | null {
  const match = ISO_DATE.exec(input.trim());
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  // Round-trips only when the date exists: the constructor normalises overflow.
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (
    probe.getUTCFullYear() !== year ||
    probe.getUTCMonth() !== month - 1 ||
    probe.getUTCDate() !== day
  ) {
    return null;
  }

  return { year, month, day };
}

/** Completed years at `at`, i.e. the age the visitor can actually claim today. */
export function ageAt(birthDate: BirthDate, at: Date): number {
  let age = at.getFullYear() - birthDate.year;
  const month = at.getMonth() + 1;
  const hadBirthday = month > birthDate.month || (month === birthDate.month && at.getDate() >= birthDate.day);
  if (!hadBirthday) age -= 1;
  return age;
}

/** True when the date is in the future or absurdly old for a living visitor. */
export function isPlausible(birthDate: BirthDate, at: Date): boolean {
  if (birthDate.year < MIN_BIRTH_YEAR) return false;
  return Date.UTC(birthDate.year, birthDate.month - 1, birthDate.day) <= at.getTime();
}
