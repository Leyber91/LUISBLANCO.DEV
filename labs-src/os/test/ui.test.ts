import { afterEach, describe, expect, it, vi } from 'vitest';
import { Consent } from '../consent.js';
import { OS_CONFIG } from '../config.js';
import { LabsOS } from '../index.js';
import { memoryStore } from '../store.js';
import { consentCopy, dataPanel, mountConsentBanner, resumePlate } from '../ui.js';
import { freshIdb } from './helpers.js';

afterEach(() => {
  LabsOS.reset();
  document.body.replaceChildren();
});

// The copy rules the anti-tells gate applies to the labs, checked on the strings the OS prints.
const TELLS = /—|\b(not just|not only|delve|seamless|unleash|empower|cutting-edge|effortlessly)\b/i;

describe('consent banner', () => {
  it('offers two choices of equal weight, nothing pre-selected, in plain copy', () => {
    const consent = new Consent(memoryStore());
    const { el } = mountConsentBanner(document.body, consent, OS_CONFIG);
    const buttons = [...el.querySelectorAll('button')];
    expect(buttons.map((b) => b.dataset['choice'])).toEqual(['granted', 'denied']);
    expect(new Set(buttons.map((b) => b.className)).size).toBe(1);          // same class: same weight
    expect(buttons.every((b) => b.getAttribute('aria-pressed') === 'false')).toBe(true);
    expect(el.querySelectorAll('input, [checked], [autofocus]')).toHaveLength(0);
    const copy = el.textContent ?? '';
    expect(copy).toMatch(/Nothing is sent unless you allow it/);
    expect(copy).toContain(OS_CONFIG.recipient);
    expect(TELLS.test(copy)).toBe(false);
  });

  it('records the choice and goes away', async () => {
    const consent = new Consent(memoryStore());
    const { el } = mountConsentBanner(document.body, consent, OS_CONFIG);
    (el.querySelector('[data-choice="granted"]') as HTMLButtonElement).click();
    await vi.waitFor(async () => expect((await consent.get()).state).toBe('granted'));
    expect(document.body.contains(el)).toBe(false);
  });

  it('copy names what would be sent and to whom', () => {
    expect(consentCopy({ ...OS_CONFIG, recipient: 'example.org' })).toMatch(/labs you open, for how long.*example\.org/);
  });
});

describe('resume plate', () => {
  it('prints the last lab, continue, and each suggestion with its reason', () => {
    const el = resumePlate({
      persistent: true,
      last: { title: 'Heptapod Codec', href: '/labs/heptapod.html', when: '2 hours ago · 14 min in view', resumeLabel: 'logogram 4 of 9' },
      next: [{ lab: 'alt-reality', title: 'Alternate Reality Scenarios', href: '/labs/altverse.html', kind: 'world', reason: 'Unvisited. You opened Heptapod Codec in this world.', world: 'contact', worldName: 'Contact' }],
    });
    expect(el.querySelector('h2')?.textContent).toBe('Heptapod Codec');
    expect(el.querySelector('.los-go')?.getAttribute('href')).toBe('/labs/heptapod.html');
    expect(el.querySelector('.los-go')?.textContent).toBe('Continue at logogram 4 of 9');
    expect(el.querySelector('.los-why')?.textContent).toMatch(/You opened Heptapod Codec in this world/);
    expect(el.querySelectorAll('.los-bk')).toHaveLength(4);
    expect(el.querySelector('.los-foot a')?.getAttribute('href')).toBe('#your-data');
    expect(TELLS.test(el.textContent ?? '')).toBe(false);
  });

  it('sets text, never markup', () => {
    const el = resumePlate({ persistent: false, next: [], last: { title: '<img src=x onerror=alert(1)>', href: '/x', when: 'now', resumeLabel: null } });
    expect(el.querySelector('img')).toBeNull();
    expect(el.textContent).toContain('kept until this tab closes');
  });
});

describe('your data panel', () => {
  it('says what is stored, exports it and deletes it after a confirmation', async () => {
    const os = await LabsOS.init({ lab: 'hub', idb: freshIdb(), fixture: null });
    await os.track('lab.action', { n: 1 });
    const panel = dataPanel(os);
    await panel.open();
    const text = () => panel.el.textContent ?? '';
    expect(text()).toMatch(/It sends nothing anywhere/);
    expect(text()).toMatch(/2 events/);
    expect(text()).not.toMatch(/Sharing/);                         // consent UI is off in v0
    expect(TELLS.test(text())).toBe(false);

    const created = vi.fn(() => 'blob:x');
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: created, revokeObjectURL: vi.fn() }));
    (panel.el.querySelector('[data-act="export"]') as HTMLButtonElement).click();
    await vi.waitFor(() => expect(text()).toMatch(/Exported 2 events/));
    expect(created).toHaveBeenCalledOnce();

    (panel.el.querySelector('[data-act="delete"]') as HTMLButtonElement).click();
    expect(text()).toMatch(/Delete 3 records from this browser\?/);           // 2 events and the last visit
    expect((await os.privacy.summary()).counts.events).toBe(2);              // nothing gone before the confirmation
    (panel.el.querySelector('[data-act="confirm"]') as HTMLButtonElement).click();
    await vi.waitFor(() => expect(text()).toMatch(/Deleted 3 records; none remain/));
    expect((await os.privacy.summary()).counts).toEqual({ events: 0, progress: 0, meta: 0 });
    expect((panel.el.querySelector('[data-act="delete"]') as HTMLButtonElement).disabled).toBe(true);
    vi.unstubAllGlobals();
  });

  it('keeps the record when the visitor steps back from deleting', async () => {
    const os = await LabsOS.init({ lab: 'hub', idb: freshIdb(), fixture: null });
    const panel = dataPanel(os);
    await panel.open();
    (panel.el.querySelector('[data-act="delete"]') as HTMLButtonElement).click();
    (panel.el.querySelector('[data-act="keep"]') as HTMLButtonElement).click();
    expect((await os.privacy.summary()).counts.events).toBe(1);
  });

  it('discloses a memory-only store', async () => {
    const os = await LabsOS.init({ lab: 'hub', fixture: 'storage-unavailable' });
    const panel = dataPanel(os);
    await panel.open();
    expect(panel.el.textContent).toMatch(/Memory only: storage is blocked/);
  });

  it('shows the sharing choice when consent is switched on', async () => {
    const os = await LabsOS.init({ lab: 'hub', fixture: 'consent' });
    const panel = dataPanel(os);
    await panel.open();
    expect(panel.el.textContent).toMatch(/Sharing/);
    expect(panel.el.textContent).toMatch(/Not chosen/);
    const pressed = [...panel.el.querySelectorAll('.los-choice button')].map((b) => b.getAttribute('aria-pressed'));
    expect(pressed).toEqual(['false', 'false']);
  });
});
