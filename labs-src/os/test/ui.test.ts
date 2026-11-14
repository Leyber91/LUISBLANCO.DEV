import { afterEach, describe, expect, it, vi } from 'vitest';
import { Consent } from '../consent.js';
import { OS_CONFIG } from '../config.js';
import { LabsOS } from '../index.js';
import { memoryStore } from '../store.js';
import { consentCopy, dataPanel, mountConsentBanner, resumePlate, sharingWords, storageStamp } from '../ui.js';
import { freshIdb, T0 } from './helpers.js';

afterEach(() => {
  LabsOS.reset();
  document.body.replaceChildren();
});

// The copy rules the anti-tells gate applies to the labs, checked on the strings the OS prints.
const TELLS = /—|\b(not just|not only|delve|seamless|unleash|empower|cutting-edge|effortlessly)\b/i;

describe('consent banner', () => {
  it('offers Allow and No thanks at equal weight, nothing pre-selected, in plain copy', () => {
    const consent = new Consent(memoryStore());
    const { el } = mountConsentBanner(document.body, consent, OS_CONFIG);
    const buttons = [...el.querySelectorAll('button')];
    expect(buttons.map((b) => b.textContent)).toEqual(['Allow', 'No thanks']);
    expect(buttons.map((b) => b.dataset['choice'])).toEqual(['granted', 'denied']);
    expect(new Set(buttons.map((b) => b.className)).size).toBe(1);          // same class: same weight
    expect(buttons.every((b) => b.getAttribute('aria-pressed') === 'false')).toBe(true);
    expect(el.querySelectorAll('input, [checked], [autofocus]')).toHaveLength(0);
    expect(TELLS.test(el.textContent ?? '')).toBe(false);
  });

  it('says exactly what is sent, what never is, where it is kept and for how long', () => {
    const consent = new Consent(memoryStore());
    const { el } = mountConsentBanner(document.body, consent, OS_CONFIG);
    expect([...el.querySelectorAll('.los-sent li')].map((li) => li.textContent)).toEqual([
      'which lab you open, and from where',
      'how long the page was visible',
      'which kinds of controls you used',
      'a random id for this browser',
    ]);
    const copy = el.textContent ?? '';
    expect(copy).toMatch(/Never anything you type\./);
    expect(copy).toMatch(/No name, email or IP address is stored with the events\./);
    expect(copy).toMatch(/kept in the EU, at Supabase \(EU, Paris\)/);
    expect(copy).toMatch(/raw events are reduced to daily counts after 90 days/);
    expect(copy).toMatch(/Nothing is sent before you choose Allow/);
    expect(copy).toMatch(/change your answer in Your data/);
    const link = el.querySelector('a');
    expect(link?.textContent).toBe('Privacy page');
    expect(link?.getAttribute('href')).toBe(OS_CONFIG.privacyHref);
  });

  it('records the choice and goes away', async () => {
    const consent = new Consent(memoryStore());
    const { el } = mountConsentBanner(document.body, consent, OS_CONFIG);
    (el.querySelector('[data-choice="granted"]') as HTMLButtonElement).click();
    await vi.waitFor(async () => expect((await consent.get()).state).toBe('granted'));
    expect(document.body.contains(el)).toBe(false);
  });

  it('copy names who receives the events', () => {
    expect(consentCopy({ ...OS_CONFIG, recipient: 'example.org' }).kept).toMatch(/at example\.org/);
  });

  it('No thanks records the refusal and goes away too', async () => {
    const consent = new Consent(memoryStore());
    const { el } = mountConsentBanner(document.body, consent, OS_CONFIG);
    (el.querySelector('[data-choice="denied"]') as HTMLButtonElement).click();
    await vi.waitFor(async () => expect((await consent.get()).state).toBe('denied'));
    expect(document.body.contains(el)).toBe(false);
  });
});

describe('sharing in words', () => {
  it('says what the choice means right now', () => {
    expect(sharingWords({ state: 'unset', t: null, policy: 2 }, true, 'R')).toBe('Not chosen: nothing is sent.');
    expect(sharingWords({ state: 'denied', t: T0, policy: 2 }, true, 'R')).toMatch(/^Off since \d+ Nov: nothing is sent\.$/);
    expect(sharingWords({ state: 'granted', t: T0, policy: 2 }, true, 'R')).toMatch(/^On since \d+ Nov: usage events go to R\.$/);
    expect(sharingWords({ state: 'granted', t: T0, policy: 2 }, false, 'R')).toMatch(/recording is off, so nothing is recorded and nothing is sent/);
  });

  it('the footer stamp says when usage is shared', () => {
    const s = { kind: 'indexeddb' as const, persistent: true, note: '', fixture: null };
    expect(storageStamp(s, true, true).textContent).toBe('Record kept in this browser · usage shared');
    expect(storageStamp(s, true, false).textContent).toBe('Record kept in this browser');
    expect(storageStamp(s, false, true).textContent).toBe('Recording off');
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

  it('says in its title block when usage is shared', () => {
    const base = { persistent: true, record: '11 events since 9 Nov', next: [], last: { title: 'Heptapod Codec', href: '/labs/heptapod.html', when: 'now', resumeLabel: null } };
    expect(resumePlate({ ...base, sharing: true }).querySelector('.los-foot .los-stamp')?.textContent)
      .toBe('Record · 11 events since 9 Nov · kept in this browser · usage shared');
    expect(resumePlate(base).querySelector('.los-foot .los-stamp')?.textContent).toBe('Record · 11 events since 9 Nov · kept in this browser');
    expect(resumePlate({ ...base, sharing: true, recording: false }).querySelector('.los-foot .los-stamp')?.textContent)
      .toBe('Recording off · the record is kept only in this browser');
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
    expect(text()).toMatch(/The record stays in this browser; usage events leave it only if you allow that under Sharing\./);
    expect(text()).toMatch(/2 events/);
    expect(text()).toMatch(/Sharing/);
    expect(text()).toMatch(/Not chosen: nothing is sent\./);
    expect(panel.el.querySelector('[data-act="erase"]')).toBeNull();           // nothing was ever sent
    expect(panel.el.querySelector('a.los-link')?.getAttribute('href')).toBe(os.config.privacyHref);
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

  it('discloses a memory-only store, where nothing is asked and nothing is sent', async () => {
    const os = await LabsOS.init({ lab: 'hub', fixture: 'storage-unavailable' });
    const panel = dataPanel(os);
    await panel.open();
    expect(panel.el.textContent).toMatch(/Memory only: storage is blocked/);
    expect(panel.el.textContent).toMatch(/The record is kept only in this browser and nothing is sent anywhere\./);
    expect(panel.el.textContent).toMatch(/this window keeps nothing, so an answer could not be remembered\. Nothing is sent\./);
    expect(panel.el.querySelector('.los-choice')).toBeNull();
  });

  it('shows the sharing choice, unpressed until the visitor chooses', async () => {
    const os = await LabsOS.init({ lab: 'hub', fixture: 'consent' });
    const panel = dataPanel(os);
    await panel.open();
    expect(panel.el.textContent).toMatch(/Sharing/);
    expect(panel.el.textContent).toMatch(/Not chosen/);
    const pressed = [...panel.el.querySelectorAll('.los-choice button')].map((b) => b.getAttribute('aria-pressed'));
    expect(pressed).toEqual(['false', 'false']);
  });

  it('shows sharing on and off as the pressed choice, with the erase only when something may have been sent', async () => {
    const on = await LabsOS.init({ lab: 'hub', fixture: 'sharing-on' });
    const panelOn = dataPanel(on);
    await panelOn.open();
    expect(panelOn.el.textContent).toMatch(/On since \d+ Nov: usage events go to Supabase \(EU, Paris\)\./);
    expect([...panelOn.el.querySelectorAll('.los-choice button')].map((b) => b.getAttribute('aria-pressed'))).toEqual(['true', 'false']);
    expect(panelOn.el.querySelector('[data-act="erase"]')?.textContent).toBe('Erase what was sent');
    panelOn.destroy();
    LabsOS.reset();

    const off = await LabsOS.init({ lab: 'hub', fixture: 'sharing-off' });
    const panelOff = dataPanel(off);
    await panelOff.open();
    expect(panelOff.el.textContent).toMatch(/Off since \d+ Nov: nothing is sent\./);
    expect([...panelOff.el.querySelectorAll('.los-choice button')].map((b) => b.getAttribute('aria-pressed'))).toEqual(['false', 'true']);
    expect(panelOff.el.querySelector('[data-act="erase"]')).toBeNull();
  });
});
