import type { AdminStaffDto, ShareholderDto, UpdateShareholderInput } from '@onyxhawk/types';

/**
 * The "Linked sign-in" choice in Edit details: which staff sign-in, if any,
 * belongs to a shareholder. A sign-in belongs to one shareholder at most.
 */

/** The choice's value for no sign-in at all. */
export const NOT_LINKED = '';

export type LinkOption = {
  /** A sign-in's id, or `NOT_LINKED`. */
  value: string;
  label: string;
  /** Linked to another shareholder, so it cannot be chosen here. */
  unavailable: boolean;
};

type SignIn = Pick<AdminStaffDto, 'id' | 'fullName' | 'email'>;
type Holder = Pick<ShareholderDto, 'id' | 'name' | 'userId' | 'userName'>;

/** The other shareholder a sign-in is linked to, as far as the page knows. */
function linkedElsewhere(userId: string, holders: Holder[], holder: Holder): Holder | undefined {
  return holders.find((h) => h.userId === userId && h.id !== holder.id);
}

/**
 * The choices for one shareholder: "Not linked", then every staff sign-in in
 * the order the Team page lists them. A sign-in linked to another shareholder
 * stays in the list, named with that shareholder, so the owner can see where
 * it went.
 */
export function linkOptions(staff: SignIn[], holders: Holder[], holder: Holder): LinkOption[] {
  const options: LinkOption[] = [{ value: NOT_LINKED, label: 'Not linked', unavailable: false }];
  for (const signIn of staff) {
    const name = signIn.email ? `${signIn.fullName} (${signIn.email})` : signIn.fullName;
    const other = linkedElsewhere(signIn.id, holders, holder);
    options.push({
      value: signIn.id,
      label: other ? `${name}, linked to ${other.name}` : name,
      unavailable: other !== undefined,
    });
  }
  // Removing someone from the team leaves their link in place, and the staff
  // list may not have arrived yet. Either way the link this shareholder has
  // now stays a choice, so the form shows it and it can be taken off.
  if (holder.userId !== null && !staff.some((signIn) => signIn.id === holder.userId)) {
    options.push({ value: holder.userId, label: holder.userName ?? 'Linked sign-in', unavailable: false });
  }
  return options;
}

/**
 * What a save sends for the link: nothing while the choice is as it was, the
 * sign-in's id when one is chosen, and null for "Not linked".
 */
export function linkInput(linkedUserId: string | null, choice: string): Pick<UpdateShareholderInput, 'userId'> {
  if (choice === (linkedUserId ?? NOT_LINKED)) return {};
  return { userId: choice === NOT_LINKED ? null : choice };
}

/**
 * The server's two refusals of a link, in the owner's words. Null for any
 * other refusal, which the form shows as the server wrote it.
 */
export function linkRefusal(serverError: string, choice: string, holders: Holder[], holder: Holder): string | null {
  if (serverError === 'that user is already on the cap table') {
    // The page's list can be behind the server's, which is how a taken sign-in got chosen.
    const other = linkedElsewhere(choice, holders, holder);
    return `That sign-in is already linked to ${other ? other.name : 'another shareholder'}. Unlink it there first, or choose another sign-in.`;
  }
  if (serverError === 'user not found') {
    return 'That sign-in no longer exists. Choose another sign-in, or “Not linked”.';
  }
  return null;
}
