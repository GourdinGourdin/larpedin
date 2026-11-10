// The light cream theme is the default, so its text pairs must stay AA (4.5:1 for text).
// Dark is checked too, since Appearance can switch to it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { BASE, GAME_THEME } from '../src/page/theme.ts';
import { DEFAULT_SETTINGS, sanitizeSettings } from '../src/page/settings.ts';

const lum = (hex: string) => {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const ratio = (a: string, b: string) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

for (const mode of ['light', 'dark'] as const) {
  const t = BASE[mode];
  test(`${mode}: text pairs are AA`, () => {
    for (const bg of [t.bg, t.surface, t.surface2]) {
      for (const fg of ['ink', 'ink2', 'muted', 'danger', 'success'] as const) {
        assert.ok(ratio(t[fg], bg) >= 4.5, `${mode} ${fg} on ${bg}: ${ratio(t[fg], bg).toFixed(2)}`);
      }
    }
  });
}

test('game accents: button text and accent ink are AA', () => {
  for (const [id, g] of Object.entries(GAME_THEME)) {
    assert.ok(ratio(g.onAccent, g.accent) >= 4.5, `${id}: ${g.onAccent} on ${g.accent} ${ratio(g.onAccent, g.accent).toFixed(2)}`);
    assert.ok(ratio(g.ink, BASE.light.surface) >= 4.5, `${id}: ink on surface ${ratio(g.ink, BASE.light.surface).toFixed(2)}`);
    assert.ok(ratio(BASE.dark.bg, g.accentDark) >= 4.5, `${id}: dark button ${ratio(BASE.dark.bg, g.accentDark).toFixed(2)}`);
    assert.ok(ratio(g.accentDark, BASE.dark.surface) >= 4.5, `${id}: dark accent text ${ratio(g.accentDark, BASE.dark.surface).toFixed(2)}`);
  }
});

test('Appearance defaults to light and rejects junk', () => {
  assert.equal(DEFAULT_SETTINGS.theme, 'light');
  assert.equal(sanitizeSettings({}).theme, 'light');
  assert.equal(sanitizeSettings({ theme: 'sepia' }).theme, 'light');
  assert.equal(sanitizeSettings({ theme: 'dark' }).theme, 'dark');
  assert.equal(sanitizeSettings({ theme: 'auto' }).theme, 'auto');
});
