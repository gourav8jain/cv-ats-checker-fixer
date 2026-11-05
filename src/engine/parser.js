// Extracts text from PDF / DOCX / TXT entirely in the browser (nothing is uploaded).
// Also collects layout signals an ATS cares about: columns, tables, images, scanned pages.

let pdfjsPromise;
async function loadPdfJs() {
  if (!pdfjsPromise) {
    pdfjsPromise = (async () => {
      const pdfjs = await import('pdfjs-dist/build/pdf.mjs');
      const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
      pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
      return pdfjs;
    })();
  }
  return pdfjsPromise;
}

export async function parseFile(file) {
  const name = (file.name || '').toLowerCase();
  const buf = await file.arrayBuffer();
  if (name.endsWith('.pdf') || file.type === 'application/pdf') return parsePdf(buf, file);
  if (name.endsWith('.docx') || file.type.includes('wordprocessingml')) return parseDocx(buf, file);
  if (name.endsWith('.doc')) {
    throw new Error('Old .doc files are not supported. Save as .docx or PDF and try again.');
  }
  if (name.endsWith('.txt') || name.endsWith('.md') || file.type.startsWith('text/')) {
    const text = new TextDecoder().decode(buf);
    return finalize(text, { fileType: 'txt', fileName: file.name, fileSize: file.size, pages: 1 });
  }
  throw new Error('Unsupported file type. Upload a PDF, DOCX or TXT file.');
}

export function parseText(text) {
  return finalize(text, { fileType: 'paste', fileName: 'pasted-resume.txt', fileSize: text.length, pages: 1 });
}

async function parsePdf(buf, file) {
  const pdfjs = await loadPdfJs();
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buf), isEvalSupported: false }).promise;
  const pageTexts = [];
  let imageCount = 0;
  let multiColumnPages = 0;
  const fonts = new Set();
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const viewport = page.getViewport({ scale: 1 });
    const content = await page.getTextContent();
    const items = content.items.filter((i) => i.str !== undefined && i.str.trim() !== '');
    items.forEach((i) => i.fontName && fonts.add(i.fontName));

    const width = viewport.width;

    // Group items into lines by their y coordinate.
    const rows = [];
    for (const it of items) {
      const y = Math.round(it.transform[5]);
      let row = rows.find((r) => Math.abs(r.y - y) <= 2);
      if (!row) { row = { y, items: [] }; rows.push(row); }
      row.items.push(it);
    }
    rows.sort((a, b) => b.y - a.y);
    const lines = rows.map((r) => {
      r.items.sort((a, b) => a.transform[4] - b.transform[4]);
      let out = '';
      let lastEnd = null;
      for (const it of r.items) {
        const x = it.transform[4];
        if (lastEnd !== null && x - lastEnd > 2 && !out.endsWith(' ')) out += x - lastEnd > 40 ? '   ' : ' ';
        out += it.str;
        lastEnd = x + (it.width || 0);
      }
      return out.replace(/\s+$/, '');
    });
    // Split each row into text segments separated by wide gaps and look at where long segments start.
    const segs = [];
    for (const r of rows) {
      let seg = null;
      r.items.forEach((it, i) => {
        const x = it.transform[4];
        const prevEnd = i > 0 ? r.items[i - 1].transform[4] + (r.items[i - 1].width || 0) : null;
        if (!seg || x - prevEnd > width * 0.06) { seg = { x: x / width, text: '' }; segs.push(seg); }
        seg.text += it.str;
      });
    }
    const longSegs = segs.filter((g) => g.text.trim().length >= 20);
    const left = longSegs.filter((g) => g.x < 0.2).length;
    const mid = longSegs.filter((g) => g.x >= 0.28 && g.x <= 0.65).length;
    if (longSegs.length >= 6 && mid >= 3 && left >= 2 && mid / longSegs.length >= 0.25) multiColumnPages++;
    pageTexts.push(lines.join('\n'));

    try {
      const ops = await page.getOperatorList();
      const imgOps = [pdfjs.OPS.paintImageXObject, pdfjs.OPS.paintInlineImageXObject, pdfjs.OPS.paintImageMaskXObject];
      imageCount += ops.fnArray.filter((f) => imgOps.includes(f)).length;
    } catch { /* ignore */ }
  }
  const text = pageTexts.join('\n');
  return finalize(text, {
    fileType: 'pdf', fileName: file.name, fileSize: file.size, pages: doc.numPages,
    images: imageCount, multiColumn: multiColumnPages > 0, fontCount: fonts.size,
  });
}

async function parseDocx(buf, file) {
  const mammoth = (await import('mammoth/mammoth.browser.js')).default || (await import('mammoth/mammoth.browser.js'));
  const [raw, html] = await Promise.all([
    mammoth.extractRawText({ arrayBuffer: buf }),
    mammoth.convertToHtml({ arrayBuffer: buf }),
  ]);
  const tables = (html.value.match(/<table/g) || []).length;
  const images = (html.value.match(/<img/g) || []).length;
  // Text boxes / headers are frequently dropped by ATS; mammoth drops them too, which is a useful proxy.
  const text = raw.value.replace(/\n{3,}/g, '\n\n');
  const pages = Math.max(1, Math.round(text.split(/\s+/).length / 500));
  return finalize(text, { fileType: 'docx', fileName: file.name, fileSize: file.size, pages, tables, images });
}

function finalize(text, meta) {
  const clean = text
    .replace(/\r/g, '')
    .replace(/[​-‍﻿]/g, '')
    .replace(/ /g, ' ')
    .replace(/[ \t]+\n/g, '\n');
  const lines = clean.split('\n').map((l) => l.trim());
  const nonEmpty = lines.filter(Boolean);
  const specialChars = (clean.match(/[☀-➿-\u{1F300}-\u{1FAFF}]/gu) || []).length;
  return {
    text: clean,
    lines: nonEmpty,
    meta: {
      tables: 0, images: 0, multiColumn: false, ...meta,
      charCount: clean.replace(/\s/g, '').length,
      wordCount: (clean.match(/\b[\w'’-]+\b/g) || []).length,
      scanned: meta.fileType === 'pdf' && clean.replace(/\s/g, '').length < 150,
      specialChars,
    },
  };
}
