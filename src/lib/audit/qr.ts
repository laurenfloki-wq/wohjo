// QR generation for the verify URL. PNG buffer for the PDF (pdfkit
// .image), inline SVG for the HTML landing page. Pure-JS (qrcode), no
// native deps.

import QRCode from 'qrcode';

export function qrPng(text: string): Promise<Buffer> {
  return QRCode.toBuffer(text, {
    type: 'png',
    margin: 1,
    width: 240,
    errorCorrectionLevel: 'M',
    color: { dark: '#16201bff', light: '#ffffffff' },
  });
}

export function qrSvg(text: string): Promise<string> {
  return QRCode.toString(text, {
    type: 'svg',
    margin: 1,
    errorCorrectionLevel: 'M',
    color: { dark: '#16201b', light: '#ffffff' },
  });
}
