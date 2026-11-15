// "Install app" — a quiet link in the start screen's trust line, never a popup.
//   Chrome / Edge / Android: shown only after the browser fired `beforeinstallprompt`; click → prompt().
//   iPhone / iPad Safari: "Add to Home Screen" opens a two-step inline explainer.
//   Already running as an installed app, or anything else: nothing.
import { h, svg } from './dom';

interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export type InstallOffer = 'prompt' | 'ios' | null;

/** What to offer, from the facts of this browser. */
export function installOffer(env: { standalone: boolean; canPrompt: boolean; iosSafari: boolean }): InstallOffer {
  if (env.standalone) return null;
  if (env.canPrompt) return 'prompt';
  if (env.iosSafari) return 'ios';
  return null;
}

/**
 * Safari on iPhone / iPad (where "Add to Home Screen" is in the Share menu). iPadOS reports a Mac
 * user agent, so a Mac UA with touch points counts too. Other iOS browsers and in-app web views
 * (Chrome, Firefox, Edge, Google app, Facebook, Instagram…) are excluded: their menus differ.
 */
export function isIosSafari(ua: string, maxTouchPoints = 0): boolean {
  const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && maxTouchPoints > 1);
  if (!ios) return false;
  if (/CriOS|FxiOS|EdgiOS|OPiOS|OPT\/|YaBrowser|DuckDuckGo|GSA\/|FBAN|FBAV|Instagram|Line\/|Twitter|MicroMessenger|Snapchat/.test(ua)) return false;
  return /Version\/[\d.]+.*Safari\//.test(ua);
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
    iosSafari: isIosSafari(navigator.userAgent, navigator.maxTouchPoints),
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
    } else if (offer === 'ios') {
      const how = h(
        'span',
        { class: 'install__how', id: 'install-how', hidden: true },
        'In Safari, tap Share ',
        svg(SHARE_ICON),
        ' then “Add to Home Screen”. Blot opens like an app and works offline.',
      );
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
        'Add to Home Screen',
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
