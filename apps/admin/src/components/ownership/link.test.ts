import { describe, expect, it } from 'vitest';

import { NOT_LINKED, linkInput, linkOptions, linkRefusal } from './link';

const account = (id: string, fullName: string, email: string | null) => ({ id, fullName, email });
const holder = (id: string, name: string, userId: string | null, userName: string | null) => ({ id, name, userId, userName });

const owner = account('u-owner', 'Amina Otieno', 'owner@onyxhawk.test');
const coo = account('u-coo', 'Brian Kiptoo', 'coo@onyxhawk.test');
const finance = account('u-finance', 'Carol Njeri', 'finance@onyxhawk.test');
const staff = [owner, coo, finance];

const company = holder('h1', 'OnyxHawk (Company)', null, null);
const amina = holder('h2', 'Amina Otieno', 'u-owner', 'Amina Otieno');
const brian = holder('h3', 'Brian Kiptoo', 'u-coo', 'Brian Kiptoo');
const holders = [company, amina, brian];

describe('linkOptions', () => {
  it('puts "Not linked" first, lists every staff sign-in once, and marks one linked to another shareholder as unavailable', () => {
    expect(linkOptions(staff, holders, company)).toEqual([
      { value: NOT_LINKED, label: 'Not linked', unavailable: false },
      { value: 'u-owner', label: 'Amina Otieno (owner@onyxhawk.test), linked to Amina Otieno', unavailable: true },
      { value: 'u-coo', label: 'Brian Kiptoo (coo@onyxhawk.test), linked to Brian Kiptoo', unavailable: true },
      { value: 'u-finance', label: 'Carol Njeri (finance@onyxhawk.test)', unavailable: false },
    ]);
  });

  it('keeps the sign-in already linked to this shareholder available, and still lists it once', () => {
    const options = linkOptions(staff, holders, amina);
    expect(options.map((o) => o.value)).toEqual([NOT_LINKED, 'u-owner', 'u-coo', 'u-finance']);
    expect(options[1]).toEqual({ value: 'u-owner', label: 'Amina Otieno (owner@onyxhawk.test)', unavailable: false });
    expect(options[2]?.unavailable).toBe(true);
  });

  it('keeps this shareholder’s link as a choice when the staff list does not have that sign-in', () => {
    const left = holder('h4', 'Dan Mutua', 'u-left', 'Dan Mutua');
    expect(linkOptions(staff, [...holders, left], left).at(-1)).toEqual({ value: 'u-left', label: 'Dan Mutua', unavailable: false });
  });
});

describe('linkInput', () => {
  it('sends no userId when the choice is left as it was', () => {
    expect(linkInput(null, NOT_LINKED)).toEqual({});
    expect(linkInput('u-coo', 'u-coo')).toEqual({});
  });

  it('sends userId: null when "Not linked" is chosen for a linked shareholder', () => {
    expect(linkInput('u-coo', NOT_LINKED)).toEqual({ userId: null });
  });

  it('sends the chosen sign-in’s id', () => {
    expect(linkInput(null, 'u-finance')).toEqual({ userId: 'u-finance' });
    expect(linkInput('u-coo', 'u-finance')).toEqual({ userId: 'u-finance' });
  });
});

describe('linkRefusal', () => {
  it('names the shareholder a sign-in is already linked to', () => {
    expect(linkRefusal('that user is already on the cap table', 'u-coo', holders, company)).toBe(
      'That sign-in is already linked to Brian Kiptoo. Unlink it there first, or choose another sign-in.',
    );
  });

  it('says a sign-in that has gone no longer exists', () => {
    expect(linkRefusal('user not found', 'u-finance', holders, company)).toBe(
      'That sign-in no longer exists. Choose another sign-in, or “Not linked”.',
    );
  });

  it('is null for any other refusal, which the form shows as the server wrote it', () => {
    expect(linkRefusal('Enter a name.', 'u-finance', holders, company)).toBeNull();
  });
});
