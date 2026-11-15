// Generates tests/fixtures/invoice.pdf: a 2-page text PDF with fake sensitive data + metadata.
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { writeFileSync } from 'node:fs';

const doc = await PDFDocument.create();
doc.setTitle('Q3 invoice — ACME confidential');
doc.setAuthor('Jane Example');
doc.setCreator('Fixture generator');
const font = await doc.embedFont(StandardFonts.Helvetica);
const mono = await doc.embedFont(StandardFonts.Courier);

const p1 = doc.addPage([612, 792]);
const lines = [
  ['Invoice #2026-0042', 20, font],
  ['Bill to: Jane Example, jane.example@acme-corp.com', 12, font],
  ['Phone: +1 (415) 555-0132', 12, font],
  ['Card on file: 4242 4242 4242 4242', 12, font],
  ['IBAN: GB82 WEST 1234 5698 7654 32', 12, font],
  ['Server: 203.0.113.42', 12, font],
  ['Total due: $1,250.00 by 2026-12-01', 12, font],
];
let y = 740;
for (const [t, size, f] of lines) { p1.drawText(t, { x: 56, y, size, font: f, color: rgb(0, 0, 0) }); y -= size + 14; }

const p2 = doc.addPage([792, 612]); // landscape
p2.drawText('Deployment notes', { x: 56, y: 560, size: 18, font });
p2.drawText('AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE', { x: 56, y: 520, size: 11, font: mono });
p2.drawText('STRIPE_KEY=sk_test_4eC39HqLyjWDarjtT1zdp7dc', { x: 56, y: 500, size: 11, font: mono });
p2.drawText('password: hunter2-Correct-Horse', { x: 56, y: 480, size: 11, font: mono });
p2.drawText('Nothing sensitive on this line, version 1.2.3 released 2026-11-15.', { x: 56, y: 440, size: 11, font });

writeFileSync(new URL('./invoice.pdf', import.meta.url), await doc.save());
console.log('wrote invoice.pdf');
