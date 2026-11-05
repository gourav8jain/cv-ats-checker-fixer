// ATS-safe exports: single column, standard font, real text (no images, tables or text boxes).
import { resumeToText } from './fixer.js';

const bText = (b) => (typeof b === 'string' ? b : b.text);

export async function toDocxBlob(doc) {
  const { Document, Packer, Paragraph, TextRun, AlignmentType, BorderStyle } = await import('docx');
  const font = 'Calibri';
  const children = [];
  const P = (runs, opts = {}) => new Paragraph({ children: runs, spacing: { after: 60 }, ...opts });
  const R = (text, o = {}) => new TextRun({ text, font, size: 21, ...o });

  children.push(P([R(doc.name || '', { bold: true, size: 36 })], { alignment: AlignmentType.CENTER, spacing: { after: 40 } }));
  if (doc.headline) children.push(P([R(doc.headline, { size: 22 })], { alignment: AlignmentType.CENTER }));
  const c = doc.contact;
  children.push(P([R([c.location, c.phone, c.email, c.linkedin, c.website].filter(Boolean).join('  |  '), { size: 19 })], { alignment: AlignmentType.CENTER, spacing: { after: 160 } }));

  for (const s of doc.sections) {
    children.push(new Paragraph({
      children: [R(s.title.toUpperCase(), { bold: true, size: 23 })],
      spacing: { before: 200, after: 80 },
      border: { bottom: { color: '444444', space: 2, style: BorderStyle.SINGLE, size: 6 } },
    }));
    if (s.type === 'text') children.push(P([R(s.text)]));
    if (s.type === 'list') children.push(P([R(s.list.join(', '))]));
    if (s.type === 'lines') s.lines.forEach((l) => children.push(P([R(l)])));
    if (s.type === 'entries') {
      for (const it of s.items) {
        if (it.heading) children.push(P([R(it.heading, { bold: true })], { spacing: { before: 120, after: 20 } }));
        it.meta.forEach((m) => children.push(P([R(m, { italics: true })], { spacing: { after: 40 } })));
        it.bullets.forEach((b) => children.push(new Paragraph({ children: [R(bText(b))], bullet: { level: 0 }, spacing: { after: 40 } })));
      }
    }
  }
  const d = new Document({
    creator: doc.name || 'Resume',
    title: `${doc.name || 'Resume'} - Resume`,
    styles: { default: { document: { run: { font, size: 21 } } } },
    sections: [{ properties: { page: { margin: { top: 720, bottom: 720, left: 864, right: 864 } } }, children }],
  });
  return Packer.toBlob(d);
}

export async function toPdfBlob(doc) {
  const { jsPDF } = await import('jspdf');
  const pdf = new jsPDF({ unit: 'pt', format: 'a4' });
  pdf.setProperties({ title: `${doc.name || 'Resume'} - Resume`, creator: 'ResumeRx' });
  const W = pdf.internal.pageSize.getWidth();
  const H = pdf.internal.pageSize.getHeight();
  const M = 50;
  let y = M;
  const ensure = (h) => { if (y + h > H - M) { pdf.addPage(); y = M; } };
  const write = (text, { size = 10.5, style = 'normal', align = 'left', indent = 0, gap = 3 } = {}) => {
    pdf.setFont('helvetica', style);
    pdf.setFontSize(size);
    const lines = pdf.splitTextToSize(clean(text), W - 2 * M - indent);
    for (const ln of lines) {
      ensure(size + gap);
      const x = align === 'center' ? W / 2 : M + indent;
      pdf.text(ln, x, y + size, { align: align === 'center' ? 'center' : 'left' });
      y += size + gap;
    }
  };
  // jsPDF's built-in fonts are WinAnsi; replace characters it cannot encode.
  const clean = (t) => String(t || '').replace(/[–—]/g, '-').replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/[•→]/g, '-').replace(/[^\x00-\xFF]/g, '');

  write(doc.name || '', { size: 20, style: 'bold', align: 'center', gap: 6 });
  if (doc.headline) write(doc.headline, { size: 11.5, align: 'center' });
  const c = doc.contact;
  write([c.location, c.phone, c.email, c.linkedin, c.website].filter(Boolean).join('  |  '), { size: 9.5, align: 'center', gap: 8 });

  for (const s of doc.sections) {
    y += 6;
    ensure(30);
    write(s.title.toUpperCase(), { size: 11.5, style: 'bold', gap: 2 });
    pdf.setDrawColor(80); pdf.setLineWidth(0.6); pdf.line(M, y + 1, W - M, y + 1); y += 7;
    if (s.type === 'text') write(s.text);
    if (s.type === 'list') write(s.list.join(', '));
    if (s.type === 'lines') s.lines.forEach((l) => write(l));
    if (s.type === 'entries') {
      for (const it of s.items) {
        y += 3;
        if (it.heading) write(it.heading, { style: 'bold' });
        it.meta.forEach((m) => write(m, { style: 'italic', size: 10 }));
        for (const b of it.bullets) {
          pdf.setFont('helvetica', 'normal'); pdf.setFontSize(10.5);
          const lines = pdf.splitTextToSize(clean(bText(b)), W - 2 * M - 14);
          lines.forEach((ln, i) => {
            ensure(13.5);
            if (i === 0) pdf.text('-', M + 3, y + 10.5);
            pdf.text(ln, M + 14, y + 10.5);
            y += 13.5;
          });
        }
      }
    }
  }
  return pdf.output('blob');
}

export function toTxtBlob(doc) {
  return new Blob([resumeToText(doc)], { type: 'text/plain' });
}

export function textToBlob(text) {
  return new Blob([text], { type: 'text/plain' });
}
