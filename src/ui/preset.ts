// Page presets for landing pages. The content build writes them on the mount element
// (<div id="app" data-mode="text" data-accept="pdf">, from the page's front matter); the app reads
// them once at start. Unknown values fall back to the defaults, so a typo never breaks the tool.

export type StartMode = 'start' | 'text';
export type Accept = 'any' | 'pdf' | 'image';

export interface Preset {
  /** Which screen the page opens on: the drop zone (default) or text mode. */
  mode: StartMode;
  /** What the drop zone asks for (wording and the file picker filter). Dropping or pasting anything still works. */
  accept: Accept;
}

export function readPreset(data: { mode?: string; accept?: string } | undefined): Preset {
  const mode = data?.mode === 'text' ? 'text' : 'start';
  const accept = data?.accept === 'pdf' || data?.accept === 'image' ? data.accept : 'any';
  return { mode, accept };
}

export interface DropzoneCopy {
  /** Text of the main button. */
  button: string;
  /** The drop zone's heading (screen-reader only on phones, where the button says it all). */
  title: string;
  /** <input type=file accept=…> */
  pickerAccept: string;
}

/** Drop-zone wording for a preset. `coarse` = touch device; `key` = the paste shortcut ("Ctrl+V" / "⌘V"). */
export function dropzoneCopy(accept: Accept, coarse: boolean, key: string): DropzoneCopy {
  switch (accept) {
    case 'pdf':
      return {
        button: 'Choose a PDF',
        title: coarse ? 'Choose a PDF' : 'Drop a PDF here, or choose one',
        pickerAccept: 'application/pdf,.pdf',
      };
    case 'image':
      return {
        button: coarse ? 'Choose a screenshot or photo' : 'Choose an image',
        title: coarse ? 'Choose a screenshot or photo' : `Paste (${key}) or drop a screenshot or photo`,
        pickerAccept: 'image/*',
      };
    default:
      return {
        button: coarse ? 'Choose a photo or PDF' : 'Choose a file',
        title: coarse ? 'Choose a screenshot, photo or PDF' : `Paste (${key}) or drop a screenshot, photo or PDF`,
        pickerAccept: 'image/*,application/pdf,.pdf',
      };
  }
}
