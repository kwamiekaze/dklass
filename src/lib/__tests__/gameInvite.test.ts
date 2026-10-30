import { describe, expect, it } from 'vitest';
import { isInviteEmail, parseInviteLines } from '../gameInvite';

describe('parseInviteLines', () => {
  it('reads name then email, email then name, and bare emails', () => {
    const r = parseInviteLines('Quamie, kwamiekaze@gmail.com\nalex@x.com, Alex\nSam sam@y.org\nlone@z.com');
    expect(r.entries).toEqual([
      { firstName: 'Quamie', email: 'kwamiekaze@gmail.com' },
      { firstName: 'Alex', email: 'alex@x.com' },
      { firstName: 'Sam', email: 'sam@y.org' },
      { firstName: '', email: 'lone@z.com' },
    ]);
  });
  it('flags bad lines and counts duplicates', () => {
    const r = parseInviteLines('nope\nA a@b.com\nB A@B.COM\n\nC c@d');
    expect(r.entries).toHaveLength(1);
    expect(r.duplicates).toBe(1);
    expect(r.invalid).toEqual(['nope', 'C c@d']);
  });
  it('handles tabs, angle brackets and trailing punctuation', () => {
    const r = parseInviteLines('Jo\t<jo@x.com>,\nPat "pat@x.com".');
    expect(r.entries.map((e) => e.email)).toEqual(['jo@x.com', 'pat@x.com']);
  });
});

describe('isInviteEmail', () => {
  it('rejects junk', () => {
    expect(isInviteEmail('a@b.co')).toBe(true);
    expect(isInviteEmail('a b@c.com')).toBe(false);
    expect(isInviteEmail('a@b')).toBe(false);
  });
});
