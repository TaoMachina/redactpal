// Tesseract parameters for screenshots. Shared by the browser worker and the Node OCR test so the
// test exercises exactly what ships.
//
// PSM 4 (single column of text of variable sizes): full-page auto layout (PSM 3) cuts monospaced /
// aligned text (terminals, logs, tables) into column blocks and drops characters at the cuts —
// measured on a 1080p log screenshot: 0/40 IP addresses read correctly with PSM 3 vs 40/40 with PSM 4.
// PSM 4 instead joins side-by-side columns into one line, which blocksToTokens() splits again at
// large gaps. The DPI hint avoids Tesseract's resolution guessing on screenshots (no DPI metadata).
export const OCR_PARAMS = {
  tessedit_pageseg_mode: '4',
  user_defined_dpi: '300',
  preserve_interword_spaces: '0',
} as const;
