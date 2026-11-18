import { describe, expect, it } from 'vitest';
import { signSlug, stlFileName } from '../src/ui/signSlug';

describe('STL file slug', () => {
  it('lowercases, converts to ASCII and uses hyphens', () => {
    expect(signSlug('Ciao Torino')).toBe('ciao-torino');
    expect(signSlug('Città!')).toBe('citta');
    expect(signSlug('  foo---BAR  ')).toBe('foo-bar');
  });

  it('stays within 40 characters and, if empty, uses sign', () => {
    expect(signSlug('a'.repeat(50))).toBe('a'.repeat(40));
    expect(signSlug(`${'a'.repeat(39)}-b`)).toBe('a'.repeat(39));
    expect(signSlug('   !!!  ')).toBe('sign');
    expect(signSlug('')).toBe('sign');
  });

  it('builds the housing and diffuser names', () => {
    expect(stlFileName('Ciao Torino', 120, 'housing')).toBe('ciao-torino-120mm-housing.stl');
    expect(stlFileName('Ciao Torino', 120, 'diffuser')).toBe('ciao-torino-120mm-diffuser.stl');
  });
});
