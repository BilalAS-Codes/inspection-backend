import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';

/**
 * Generates a branded proposal PDF document.
 *
 * @param {object} data
 * @param {string} data.proposalId
 * @param {string} data.clientName
 * @param {string} data.scope
 * @param {number} data.amount
 * @param {string} data.currency
 * @param {number} data.validityDays
 * @param {string} [data.type]
 * @returns {Promise<Buffer>}
 */
export async function renderProposalPdf(data) {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595.28, 841.89]); // A4
  const { width, height } = page.getSize();

  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const regularFont = await pdfDoc.embedFont(StandardFonts.Helvetica);

  // Top Accent Bar
  page.drawRectangle({
    x: 0,
    y: height - 8,
    width,
    height: 8,
    color: rgb(0.09, 0.09, 0.09),
  });

  // Header
  page.drawText('MUSADAQAH BUSINESS SOLUTION', {
    x: 50,
    y: height - 60,
    size: 16,
    font: boldFont,
    color: rgb(0.09, 0.09, 0.09),
  });

  page.drawText('COMMERCIAL & TECHNICAL INSPECTION SERVICES - SAUDI ARABIA', {
    x: 50,
    y: height - 76,
    size: 8,
    font: regularFont,
    color: rgb(0.45, 0.45, 0.45),
  });

  page.drawLine({
    start: { x: 50, y: height - 90 },
    end: { x: width - 50, y: height - 90 },
    thickness: 1,
    color: rgb(0.85, 0.85, 0.85),
  });

  // Document Title
  page.drawText('INSPECTION PROPOSAL & SERVICE AGREEMENT', {
    x: 50,
    y: height - 130,
    size: 14,
    font: boldFont,
    color: rgb(0.09, 0.09, 0.09),
  });

  page.drawText(`Reference: PROP-${data.proposalId.slice(0, 8).toUpperCase()}`, {
    x: 50,
    y: height - 148,
    size: 9,
    font: regularFont,
    color: rgb(0.45, 0.45, 0.45),
  });

  // Client Details Box
  page.drawRectangle({
    x: 50,
    y: height - 230,
    width: width - 100,
    height: 65,
    borderColor: rgb(0.85, 0.85, 0.85),
    borderWidth: 1,
    color: rgb(0.98, 0.98, 0.98),
  });

  page.drawText('PREPARED FOR:', {
    x: 65,
    y: height - 185,
    size: 8,
    font: boldFont,
    color: rgb(0.45, 0.45, 0.45),
  });

  page.drawText(data.clientName || 'Valued Client', {
    x: 65,
    y: height - 205,
    size: 12,
    font: boldFont,
    color: rgb(0.09, 0.09, 0.09),
  });

  // Scope Section
  page.drawText('SCOPE OF INSPECTION SERVICES', {
    x: 50,
    y: height - 265,
    size: 10,
    font: boldFont,
    color: rgb(0.09, 0.09, 0.09),
  });

  const scopeText = data.scope || 'Standard regulatory compliance and technical inspection.';
  page.drawText(scopeText, {
    x: 50,
    y: height - 285,
    size: 10,
    font: regularFont,
    color: rgb(0.2, 0.2, 0.2),
    maxWidth: width - 100,
    lineHeight: 14,
  });

  // Commercials Table
  const tableY = height - 370;
  page.drawRectangle({
    x: 50,
    y: tableY,
    width: width - 100,
    height: 28,
    color: rgb(0.95, 0.95, 0.95),
  });

  page.drawText('Description', { x: 65, y: tableY + 9, size: 9, font: boldFont, color: rgb(0.3, 0.3, 0.3) });
  page.drawText('Amount (SAR)', { x: width - 150, y: tableY + 9, size: 9, font: boldFont, color: rgb(0.3, 0.3, 0.3) });

  page.drawText('Complete Inspection, Testing & Regulatory Certification', {
    x: 65,
    y: tableY - 20,
    size: 9,
    font: regularFont,
    color: rgb(0.1, 0.1, 0.1),
  });

  const subtotal = Number(data.amount) || 0;
  const vat = Math.round((subtotal * 0.15 + Number.EPSILON) * 100) / 100;
  const total = Math.round((subtotal + vat + Number.EPSILON) * 100) / 100;

  page.drawText(subtotal.toFixed(2), {
    x: width - 130,
    y: tableY - 20,
    size: 9,
    font: regularFont,
    color: rgb(0.1, 0.1, 0.1),
  });

  page.drawLine({
    start: { x: 50, y: tableY - 35 },
    end: { x: width - 50, y: tableY - 35 },
    thickness: 1,
    color: rgb(0.85, 0.85, 0.85),
  });

  page.drawText('Subtotal:', { x: width - 200, y: tableY - 55, size: 9, font: regularFont, color: rgb(0.4, 0.4, 0.4) });
  page.drawText(`${subtotal.toFixed(2)} SAR`, { x: width - 130, y: tableY - 55, size: 9, font: regularFont, color: rgb(0.1, 0.1, 0.1) });

  page.drawText('VAT (15%):', { x: width - 200, y: tableY - 72, size: 9, font: regularFont, color: rgb(0.4, 0.4, 0.4) });
  page.drawText(`${vat.toFixed(2)} SAR`, { x: width - 130, y: tableY - 72, size: 9, font: regularFont, color: rgb(0.1, 0.1, 0.1) });

  page.drawText('Total Amount:', { x: width - 200, y: tableY - 92, size: 10, font: boldFont, color: rgb(0.09, 0.09, 0.09) });
  page.drawText(`${total.toFixed(2)} SAR`, { x: width - 130, y: tableY - 92, size: 10, font: boldFont, color: rgb(0.09, 0.09, 0.09) });

  // Validity and terms
  page.drawText(`* Validity: This proposal remains valid for ${data.validityDays || 30} days from issuance.`, {
    x: 50,
    y: 120,
    size: 8,
    font: regularFont,
    color: rgb(0.5, 0.5, 0.5),
  });

  page.drawText('Musadaqah Business Solution - CR 1010101010 - VAT 300000000000003', {
    x: 50,
    y: 50,
    size: 8,
    font: regularFont,
    color: rgb(0.5, 0.5, 0.5),
  });

  const pdfBytes = await pdfDoc.save();
  return Buffer.from(pdfBytes);
}

/**
 * Generates an official, tamper-evident Certificate PDF with embedded QR code.
 *
 * @param {object} data
 * @param {string} data.certificateNumber
 * @param {string} data.certificateType
 * @param {string} data.equipmentSerial
 * @param {string} data.inspectingCompanyName
 * @param {string} data.issuedAt
 * @param {string} data.expiresAt
 * @param {object} data.equipment
 * @param {string} data.verifyUrl
 * @param {Buffer} qrPngBuffer
 * @returns {Promise<Buffer>}
 */
export async function renderCertificatePdf(data, qrPngBuffer) {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595.28, 841.89]); // A4
  const { width, height } = page.getSize();

  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const regularFont = await pdfDoc.embedFont(StandardFonts.Helvetica);

  // Decorative border
  page.drawRectangle({
    x: 25,
    y: 25,
    width: width - 50,
    height: height - 50,
    borderWidth: 2,
    borderColor: rgb(0.1, 0.1, 0.1),
    color: rgb(1, 1, 1),
  });

  page.drawRectangle({
    x: 29,
    y: 29,
    width: width - 58,
    height: height - 58,
    borderWidth: 0.5,
    borderColor: rgb(0.7, 0.7, 0.7),
  });

  // Top Branding
  page.drawText('MUSADAQAH BUSINESS SOLUTION', {
    x: width / 2 - 135,
    y: height - 75,
    size: 16,
    font: boldFont,
    color: rgb(0.09, 0.09, 0.09),
  });

  page.drawText('ACCREDITED TECHNICAL INSPECTION & CONFORMANCE SERVICES', {
    x: width / 2 - 150,
    y: height - 92,
    size: 8,
    font: regularFont,
    color: rgb(0.4, 0.4, 0.4),
  });

  // Certificate Heading
  page.drawText('CERTIFICATE OF INSPECTION', {
    x: width / 2 - 120,
    y: height - 140,
    size: 16,
    font: boldFont,
    color: rgb(0.05, 0.05, 0.05),
  });

  page.drawText(`Certificate No: ${data.certificateNumber}`, {
    x: width / 2 - 80,
    y: height - 160,
    size: 11,
    font: boldFont,
    color: rgb(0.2, 0.2, 0.2),
  });

  // Certification statement
  const bodyText = 'This certifies that the equipment described below has been inspected, tested, and evaluated in accordance with statutory regulations and applicable engineering safety standards.';
  page.drawText(bodyText, {
    x: 60,
    y: height - 200,
    size: 10,
    font: regularFont,
    color: rgb(0.25, 0.25, 0.25),
    maxWidth: width - 120,
    lineHeight: 14,
  });

  // Equipment Specifications Box
  const specY = height - 270;
  page.drawRectangle({
    x: 55,
    y: specY - 110,
    width: width - 110,
    height: 140,
    borderWidth: 1,
    borderColor: rgb(0.85, 0.85, 0.85),
    color: rgb(0.98, 0.98, 0.98),
  });

  page.drawText('EQUIPMENT SPECIFICATIONS', {
    x: 70,
    y: specY + 12,
    size: 9,
    font: boldFont,
    color: rgb(0.4, 0.4, 0.4),
  });

  const eq = data.equipment || {};
  const leftX = 70;
  const valX = 180;
  const rightLeftX = 310;
  const rightValX = 420;

  page.drawText('Manufacturer:', { x: leftX, y: specY - 15, size: 9, font: regularFont, color: rgb(0.4, 0.4, 0.4) });
  page.drawText(eq.manufacturer || 'N/A', { x: valX, y: specY - 15, size: 9, font: boldFont, color: rgb(0.1, 0.1, 0.1) });

  page.drawText('Model:', { x: leftX, y: specY - 35, size: 9, font: regularFont, color: rgb(0.4, 0.4, 0.4) });
  page.drawText(eq.model || 'N/A', { x: valX, y: specY - 35, size: 9, font: boldFont, color: rgb(0.1, 0.1, 0.1) });

  page.drawText('Serial Number:', { x: leftX, y: specY - 55, size: 9, font: regularFont, color: rgb(0.4, 0.4, 0.4) });
  page.drawText(data.equipmentSerial || eq.serial || 'N/A', { x: valX, y: specY - 55, size: 9, font: boldFont, color: rgb(0.1, 0.1, 0.1) });

  page.drawText('Manufacturing Year:', { x: rightLeftX, y: specY - 15, size: 9, font: regularFont, color: rgb(0.4, 0.4, 0.4) });
  page.drawText(String(eq.year || 'N/A'), { x: rightValX, y: specY - 15, size: 9, font: boldFont, color: rgb(0.1, 0.1, 0.1) });

  page.drawText('Rated Capacity:', { x: rightLeftX, y: specY - 35, size: 9, font: regularFont, color: rgb(0.4, 0.4, 0.4) });
  page.drawText(eq.capacity || 'N/A', { x: rightValX, y: specY - 35, size: 9, font: boldFont, color: rgb(0.1, 0.1, 0.1) });

  page.drawText('Certificate Type:', { x: rightLeftX, y: specY - 55, size: 9, font: regularFont, color: rgb(0.4, 0.4, 0.4) });
  page.drawText(data.certificateType || 'Safety Compliance', { x: rightValX, y: specY - 55, size: 9, font: boldFont, color: rgb(0.1, 0.1, 0.1) });

  // Validity Period
  const valPeriodY = height - 425;
  page.drawText('Date of Inspection:', { x: 70, y: valPeriodY, size: 9, font: regularFont, color: rgb(0.4, 0.4, 0.4) });
  page.drawText(new Date(data.issuedAt).toLocaleDateString('en-GB'), { x: 180, y: valPeriodY, size: 9, font: boldFont, color: rgb(0.1, 0.1, 0.1) });

  page.drawText('Certificate Expiration:', { x: 310, y: valPeriodY, size: 9, font: regularFont, color: rgb(0.4, 0.4, 0.4) });
  page.drawText(new Date(data.expiresAt).toLocaleDateString('en-GB'), { x: 420, y: valPeriodY, size: 9, font: boldFont, color: rgb(0.1, 0.1, 0.1) });

  // Verification & QR section
  const qrImage = await pdfDoc.embedPng(qrPngBuffer);
  const qrDim = 90;
  const qrX = width / 2 - qrDim / 2;
  const qrY = 130;

  page.drawImage(qrImage, {
    x: qrX,
    y: qrY,
    width: qrDim,
    height: qrDim,
  });

  page.drawText('SCAN TO VERIFY AUTHENTICITY', {
    x: width / 2 - 68,
    y: qrY - 15,
    size: 7,
    font: boldFont,
    color: rgb(0.2, 0.2, 0.2),
  });

  page.drawText(data.verifyUrl, {
    x: width / 2 - 110,
    y: qrY - 27,
    size: 6,
    font: regularFont,
    color: rgb(0.45, 0.45, 0.45),
  });

  // Footer
  page.drawText(`Inspecting Authority: ${data.inspectingCompanyName || 'Musadaqah Business Solution'}`, {
    x: 60,
    y: 50,
    size: 8,
    font: regularFont,
    color: rgb(0.4, 0.4, 0.4),
  });

  const pdfBytes = await pdfDoc.save();
  return Buffer.from(pdfBytes);
}

/**
 * Generates an executive tabular report PDF for statutory and managerial reporting.
 *
 * @param {object} params
 * @param {string} params.title - Report title
 * @param {string} [params.subtitle] - Optional subtitle
 * @param {string} [params.dateRange] - Date filter description
 * @param {Array<{ header: string, width: number, align?: 'left' | 'right' | 'center' }>} params.columns
 * @param {Array<Array<string|number>>} params.rows
 * @returns {Promise<Buffer>}
 */
export async function renderTableReportPdf({ title, subtitle, dateRange, columns, rows }) {
  const pdfDoc = await PDFDocument.create();
  let page = pdfDoc.addPage([595.28, 841.89]); // A4 portrait
  let { width, height } = page.getSize();

  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const regularFont = await pdfDoc.embedFont(StandardFonts.Helvetica);

  const drawHeader = (currentPage, pageNum, totalPages) => {
    // Top banner
    currentPage.drawRectangle({
      x: 0,
      y: height - 6,
      width,
      height: 6,
      color: rgb(0.12, 0.16, 0.22),
    });

    currentPage.drawText('MUSADAQAH BUSINESS SOLUTION', {
      x: 40,
      y: height - 40,
      size: 13,
      font: boldFont,
      color: rgb(0.1, 0.15, 0.25),
    });

    currentPage.drawText(title.toUpperCase(), {
      x: 40,
      y: height - 58,
      size: 11,
      font: boldFont,
      color: rgb(0.2, 0.2, 0.2),
    });

    if (subtitle || dateRange) {
      currentPage.drawText(`${subtitle || 'Official Analytical Extract'} | Filter: ${dateRange || 'All Time'}`, {
        x: 40,
        y: height - 72,
        size: 8,
        font: regularFont,
        color: rgb(0.45, 0.45, 0.45),
      });
    }

    const genDate = new Date().toISOString().replace('T', ' ').substring(0, 19) + ' UTC';
    currentPage.drawText(`Generated: ${genDate}`, {
      x: width - 200,
      y: height - 40,
      size: 8,
      font: regularFont,
      color: rgb(0.45, 0.45, 0.45),
    });

    currentPage.drawLine({
      start: { x: 40, y: height - 82 },
      end: { x: width - 40, y: height - 82 },
      thickness: 1,
      color: rgb(0.85, 0.85, 0.85),
    });
  };

  drawHeader(page, 1, 1);

  // Table header position
  let currentY = height - 105;
  const tableLeftX = 40;
  const rowHeight = 22;

  // Header background
  page.drawRectangle({
    x: tableLeftX,
    y: currentY - 5,
    width: width - 80,
    height: rowHeight,
    color: rgb(0.93, 0.95, 0.98),
  });

  // Draw table column headers
  let colX = tableLeftX + 8;
  for (const col of columns) {
    page.drawText(col.header.toUpperCase(), {
      x: colX,
      y: currentY + 3,
      size: 8,
      font: boldFont,
      color: rgb(0.15, 0.2, 0.3),
    });
    colX += col.width;
  }

  currentY -= rowHeight;

  // Draw rows
  for (let rIdx = 0; rIdx < rows.length; rIdx++) {
    // If approaching page bottom, spawn new page
    if (currentY < 60) {
      page = pdfDoc.addPage([595.28, 841.89]);
      drawHeader(page, 2, 2);
      currentY = height - 105;

      // Draw header on new page
      page.drawRectangle({
        x: tableLeftX,
        y: currentY - 5,
        width: width - 80,
        height: rowHeight,
        color: rgb(0.93, 0.95, 0.98),
      });

      colX = tableLeftX + 8;
      for (const col of columns) {
        page.drawText(col.header.toUpperCase(), {
          x: colX,
          y: currentY + 3,
          size: 8,
          font: boldFont,
          color: rgb(0.15, 0.2, 0.3),
        });
        colX += col.width;
      }
      currentY -= rowHeight;
    }

    const row = rows[rIdx];

    // Alternating zebra stripe
    if (rIdx % 2 === 1) {
      page.drawRectangle({
        x: tableLeftX,
        y: currentY - 4,
        width: width - 80,
        height: rowHeight,
        color: rgb(0.98, 0.98, 0.99),
      });
    }

    // Row divider
    page.drawLine({
      start: { x: tableLeftX, y: currentY - 4 },
      end: { x: width - tableLeftX, y: currentY - 4 },
      thickness: 0.5,
      color: rgb(0.9, 0.9, 0.9),
    });

    // Cell texts
    colX = tableLeftX + 8;
    for (let cIdx = 0; cIdx < columns.length; cIdx++) {
      const col = columns[cIdx];
      const val = row[cIdx] !== null && row[cIdx] !== undefined ? String(row[cIdx]) : '-';
      page.drawText(val, {
        x: colX,
        y: currentY + 3,
        size: 8,
        font: regularFont,
        color: rgb(0.15, 0.15, 0.15),
      });
      colX += col.width;
    }

    currentY -= rowHeight;
  }

  // Footer on page
  page.drawText('Invertio Inspection Management System - Confidential & Proprietary', {
    x: 40,
    y: 25,
    size: 7,
    font: regularFont,
    color: rgb(0.5, 0.5, 0.5),
  });

  const pdfBytes = await pdfDoc.save();
  return Buffer.from(pdfBytes);
}

