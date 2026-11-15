// "Try a sample": a realistic but entirely fake chat screenshot drawn at runtime (so no binary
// asset ships with the app), plus sample text for text mode. Every value is a well-known test or
// documentation value. Key-like strings are assembled from parts so secret scanners don't flag
// this source file.

const STRIPE_TEST = ['sk', 'test', '4eC39HqLyjWDarjtT1zdp7dc'].join('_');
const AWS_EXAMPLE = 'AKIA' + 'IOSFODNN7EXAMPLE';

export const SAMPLE_TEXT = `Hi Sam,

Here are the details for the vendor portal while I'm on leave:

Login: priya.raman@example.com
Password: Tr0ub4dor&3-staging
API key: ${STRIPE_TEST}
Server: 10.0.4.17

If anything breaks, call me on +1 415 555 0132. The team card for renewals is 4242 4242 4242 4242 and refunds go to IBAN DE89 3704 0044 0532 0130 00.

Thanks,
Priya`;

type Line = { kind: 'text'; text: string } | { kind: 'code'; lines: string[] };

interface Message {
  name: string;
  initials: string;
  color: string;
  time: string;
  body: Line[];
}

const MESSAGES: Message[] = [
  {
    name: 'Priya Raman',
    initials: 'PR',
    color: '#5B6CC8',
    time: '10:42',
    body: [
      { kind: 'text', text: 'Deploy to staging keeps failing. This is what I have in .env right now:' },
      {
        kind: 'code',
        lines: [
          `AWS_ACCESS_KEY_ID=${AWS_EXAMPLE}`,
          `STRIPE_SECRET_KEY=${STRIPE_TEST}`,
          'DB_HOST=10.0.4.17',
          'ALERT_EMAIL=priya.raman@example.com',
        ],
      },
    ],
  },
  {
    name: 'Tom Becker',
    initials: 'TB',
    color: '#2F8F6B',
    time: '10:45',
    body: [
      { kind: 'text', text: 'Looks like the key was rotated. I’ll retry checkout with the test card 4242 4242 4242 4242.' },
      { kind: 'text', text: 'Call me on +1 415 555 0132 if it breaks again.' },
    ],
  },
  {
    name: 'Priya Raman',
    initials: 'PR',
    color: '#5B6CC8',
    time: '10:46',
    body: [{ kind: 'text', text: 'Thanks! Release 2.4.1 goes out after lunch, no rush.' }],
  },
];

const SANS = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
const MONO = 'ui-monospace, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace';

const W = 780;
const PAD = 24;
const TEXT_X = 76;
const MAX_TEXT = W - TEXT_X - PAD;

function wrap(g: CanvasRenderingContext2D, text: string, max: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (g.measureText(next).width > max && cur) {
      lines.push(cur);
      cur = w;
    } else cur = next;
  }
  if (cur) lines.push(cur);
  return lines;
}

/** Lays out (and, if `draw`, paints) the window; returns its height in CSS px. */
function paint(g: CanvasRenderingContext2D, draw: boolean, height: number): number {
  if (draw) {
    g.fillStyle = '#FFFFFF';
    g.fillRect(0, 0, W, height);
    // Title bar
    g.fillStyle = '#F2F3F5';
    g.fillRect(0, 0, W, 48);
    g.fillStyle = '#E1E3E8';
    g.fillRect(0, 48, W, 1);
    ['#EC6A5E', '#F4BF4F', '#61C554'].forEach((c, i) => {
      g.beginPath();
      g.arc(22 + i * 20, 24, 6, 0, Math.PI * 2);
      g.fillStyle = c;
      g.fill();
    });
    g.fillStyle = '#1D1F24';
    g.font = `600 16px ${SANS}`;
    g.textBaseline = 'middle';
    g.fillText('# backend-help', 92, 25);
    g.fillStyle = '#6B7079';
    g.font = `14px ${SANS}`;
    g.fillText('3 members', 92 + g.measureText('# backend-help').width + 52, 25);
  }

  let y = 72;
  for (const m of MESSAGES) {
    const top = y;
    if (draw) {
      g.beginPath();
      g.arc(PAD + 20, top + 20, 20, 0, Math.PI * 2);
      g.fillStyle = m.color;
      g.fill();
      g.fillStyle = '#FFFFFF';
      g.font = `600 14px ${SANS}`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(m.initials, PAD + 20, top + 21);
      g.textAlign = 'left';
      g.textBaseline = 'alphabetic';
      g.fillStyle = '#1D1F24';
      g.font = `700 16px ${SANS}`;
      g.fillText(m.name, TEXT_X, top + 15);
      const nw = g.measureText(m.name).width;
      g.fillStyle = '#7A7F88';
      g.font = `13px ${SANS}`;
      g.fillText(m.time, TEXT_X + nw + 10, top + 15);
    }
    y = top + 26;
    for (const part of m.body) {
      if (part.kind === 'text') {
        g.font = `16px ${SANS}`;
        for (const line of wrap(g, part.text, MAX_TEXT)) {
          y += 22;
          if (draw) {
            g.fillStyle = '#25282E';
            g.fillText(line, TEXT_X, y);
          }
        }
        y += 6;
      } else {
        const lineH = 24;
        const boxH = part.lines.length * lineH + 20;
        y += 8;
        if (draw) {
          g.fillStyle = '#F6F7F9';
          g.strokeStyle = '#DDE0E5';
          g.lineWidth = 1;
          g.beginPath();
          g.roundRect(TEXT_X, y, MAX_TEXT, boxH, 6);
          g.fill();
          g.stroke();
          g.fillStyle = '#1F2328';
          g.font = `15px ${MONO}`;
          part.lines.forEach((l, i) => g.fillText(l, TEXT_X + 14, y + 10 + (i + 1) * lineH - 7));
        }
        y += boxH + 6;
      }
    }
    y += 18;
  }
  return y + 8;
}

/** Render the fake screenshot at 2x and return it as a PNG file. */
export async function createSampleScreenshot(): Promise<File> {
  const S = 2;
  const scratch = document.createElement('canvas').getContext('2d');
  if (!scratch) throw new Error('Canvas is not available');
  const height = Math.ceil(paint(scratch, false, 0));

  const canvas = document.createElement('canvas');
  canvas.width = W * S;
  canvas.height = height * S;
  const g = canvas.getContext('2d');
  if (!g) throw new Error('Canvas is not available');
  g.scale(S, S);
  paint(g, true, height);

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  canvas.width = canvas.height = 0;
  if (!blob) throw new Error('Couldn’t create the sample image');
  return new File([blob], 'sample-screenshot.png', { type: 'image/png' });
}
