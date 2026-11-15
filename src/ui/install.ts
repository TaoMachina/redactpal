// "Install app" — a quiet link in the start screen's trust line, never a popup.
//   Browsers with an install prompt (Chrome / Edge / Android Chrome): "Install app" → prompt().
//   Browsers where installing is a manual menu step (every iPhone/iPad browser since iOS 16.4,
//   Firefox on Android, Safari on Mac): a link that opens a one-line, browser-specific how-to.
//   Already running as an installed app, or in-app web views (Instagram, WeChat…): nothing.
import { h, svg } from './dom';

interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export type ManualInstall = 'ios-safari' | 'ios-chrome' | 'ios-edge' | 'ios-firefox' | 'android-firefox' | 'mac-safari';
export type InstallOffer = 'prompt' | ManualInstall | null;

/** What to offer, from the facts of this browser. */
export function installOffer(env: { standalone: boolean; canPrompt: boolean; manual: ManualInstall | null }): InstallOffer {
  if (env.standalone) return null;
  if (env.canPrompt) return 'prompt';
  return env.manual;
}

const IN_APP = /OPiOS|OPT\/|YaBrowser|DuckDuckGo|GSA\/|FBAN|FBAV|Instagram|Line\/|Twitter|MicroMessenger|Snapchat|TikTok|musical_ly/;

/** iOS version from "CPU iPhone OS 17_2 like Mac OS X" as 17.02 (iPadOS with a Mac UA: unknown → assume new). */
function iosVersion(ua: string): number {
  const m = /OS (\d+)_(\d+)/.exec(ua);
  return m ? Number(m[1]) + Number(m[2]) / 100 : 99;
}

/**
 * Which manual "add to home screen" route this browser has, if any. iPadOS reports a Mac user
 * agent, so a Mac UA with touch points counts as iOS. Third-party iOS browsers can add to the
 * home screen since iOS 16.4. In-app web views can't, so they get nothing.
 */
export function manualInstallFor(ua: string, maxTouchPoints = 0): ManualInstall | null {
  if (IN_APP.test(ua)) return null;
  const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && maxTouchPoints > 1);
  if (ios) {
    const modern = iosVersion(ua) >= 16.04;
    if (/CriOS\//.test(ua)) return modern ? 'ios-chrome' : null;
    if (/EdgiOS\//.test(ua)) return modern ? 'ios-edge' : null;
    if (/FxiOS\//.test(ua)) return modern ? 'ios-firefox' : null;
    return /Version\/[\d.]+.*Safari\//.test(ua) ? 'ios-safari' : null; // bare web views have no "Safari/"
  }
  if (/Android/.test(ua) && /Firefox\//.test(ua)) return 'android-firefox';
  const mac = /Macintosh/.test(ua) && !/Chrome\/|Chromium|Edg\/|Firefox\//.test(ua);
  const safari = /Version\/(\d+)[\d.]*.*Safari\//.exec(ua);
  if (mac && safari && Number(safari[1]) >= 17) return 'mac-safari'; // "Add to Dock" arrived in Safari 17
  return null;
}

/** Kept for callers/tests that only care about Safari on iPhone/iPad. */
export function isIosSafari(ua: string, maxTouchPoints = 0): boolean {
  return manualInstallFor(ua, maxTouchPoints) === 'ios-safari';
}

export function isStandalone(): boolean {
  const nav = navigator as Navigator & { standalone?: boolean };
  return nav.standalone === true || (typeof matchMedia === 'function' && matchMedia('(display-mode: standalone)').matches);
}

let deferred: InstallPromptEvent | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((fn) => fn());

/** Call once at startup, before the browser can fire `beforeinstallprompt`. */
export function initInstall(): void {
  window.addEventListener('beforeinstallprompt', (e) => {
    // Keep Chrome's own mini-infobar from popping up; we show a quiet link instead.
    e.preventDefault();
    deferred = e as InstallPromptEvent;
    notify();
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    notify();
  });
}

function currentOffer(): InstallOffer {
  return installOffer({
    standalone: isStandalone(),
    canPrompt: deferred !== null,
    manual: manualInstallFor(navigator.userAgent, navigator.maxTouchPoints),
  });
}

const SHARE_ICON =
  '<svg class="install__icon" viewBox="0 0 20 20" width="16" height="16" aria-hidden="true"><path d="M10 2.5v10M6.5 6 10 2.5 13.5 6" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M7 8.5H5.5a1 1 0 0 0-1 1v7a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1v-7a1 1 0 0 0-1-1H13" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>';

/** The link (and, on iOS, its explainer). Updates itself when the browser makes install possible. */
export function createInstallLink(): { el: HTMLElement; destroy(): void } {
  const el = h('span', { class: 'install' });

  const render = () => {
    const offer = currentOffer();
    if (offer === 'prompt') {
      el.replaceChildren(
        h('span', { class: 'install__sep', 'aria-hidden': 'true' }, ' · '),
        h('button', { type: 'button', class: 'linkbtn linkbtn--soft install__link', onclick: () => void install() }, 'Install app'),
      );
    } else if (offer) {
      const share = () => svg(SHARE_ICON);
      const steps: Record<ManualInstall, (string | Element)[]> = {
        'ios-safari': ['Tap Share ', share(), ' then “Add to Home Screen”.'],
        'ios-chrome': ['Tap Share ', share(), ' in the address bar (or ⋯ → Share), then “Add to Home Screen”.'],
        'ios-edge': ['Tap ⋯ → Share ', share(), ', then “Add to Home Screen”.'],
        'ios-firefox': ['Tap the menu ☰ → Share, then “Add to Home Screen”.'],
        'android-firefox': ['Tap the ⋮ menu, then “Install”.'],
        'mac-safari': ['In the menu bar, choose File → “Add to Dock”.'],
      };
      const label = offer === 'mac-safari' ? 'Add to Dock' : offer === 'android-firefox' ? 'Install app' : 'Add to Home Screen';
      const how = h('span', { class: 'install__how', id: 'install-how', hidden: true }, ...steps[offer], ' Redactly then opens like an app and works offline.');
      const link = h(
        'button',
        {
          type: 'button',
          class: 'linkbtn linkbtn--soft install__link',
          'aria-expanded': 'false',
          'aria-controls': 'install-how',
          onclick: () => {
            const open = how.hidden;
            how.hidden = !open;
            link.setAttribute('aria-expanded', String(open));
          },
        },
        label,
      );
      el.replaceChildren(h('span', { class: 'install__sep', 'aria-hidden': 'true' }, ' · '), link, how);
    } else {
      el.replaceChildren();
    }
  };

  listeners.add(render);
  render();
  return { el, destroy: () => listeners.delete(render) };
}

async function install(): Promise<void> {
  const e = deferred;
  if (!e) return;
  // A prompt event can be used once; whatever the answer, the link goes away for this visit.
  deferred = null;
  try {
    await e.prompt();
    await e.userChoice;
  } catch {
    /* the browser refused; nothing to do */
  }
  notify();
}
