import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { pool, withTransaction } from './client.js';
import { config } from '../config.js';
import { storage } from '../shared/storage.js';
import { renderProposalPdf, renderCertificatePdf } from '../shared/pdf.js';
import { signVerifyToken, generateQrBuffer } from '../shared/qr.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Creates a clean branded PDF buffer for company/engineer credential vault documents.
 * @param {string} title
 * @param {string} subtitle
 * @returns {Promise<Buffer>}
 */
async function createSamplePdf(title, subtitle = 'Musadaqah Business Solution - Inspection Management System') {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595.28, 841.89]);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);

  // Top accent bar
  page.drawRectangle({
    x: 0,
    y: 841.89 - 8,
    width: 595.28,
    height: 8,
    color: rgb(0.12, 0.16, 0.22),
  });

  page.drawText('MUSADAQAH BUSINESS SOLUTION', {
    x: 50,
    y: 780,
    size: 16,
    font: fontBold,
    color: rgb(0.1, 0.15, 0.25),
  });

  page.drawText(title.toUpperCase(), {
    x: 50,
    y: 750,
    size: 13,
    font: fontBold,
    color: rgb(0.2, 0.2, 0.2),
  });

  page.drawText(subtitle, {
    x: 50,
    y: 730,
    size: 9,
    font: fontRegular,
    color: rgb(0.45, 0.45, 0.45),
  });

  page.drawLine({
    start: { x: 50, y: 715 },
    end: { x: 545.28, y: 715 },
    thickness: 1,
    color: rgb(0.85, 0.85, 0.85),
  });

  page.drawText('Official Document Verified & Secured Under SASO / ZATCA Regulatory Framework', {
    x: 50,
    y: 680,
    size: 9,
    font: fontRegular,
    color: rgb(0.3, 0.3, 0.3),
  });

  page.drawText(`Document Issuance Timestamp: ${new Date().toISOString()}`, {
    x: 50,
    y: 660,
    size: 8,
    font: fontRegular,
    color: rgb(0.5, 0.5, 0.5),
  });

  page.drawText('Confidential & Tamper-Evident Digital Copy', {
    x: 50,
    y: 50,
    size: 8,
    font: fontRegular,
    color: rgb(0.55, 0.55, 0.55),
  });

  const pdfBytes = await pdfDoc.save();
  return Buffer.from(pdfBytes);
}

/**
 * Calculates dates relative to today.
 * @param {number} days
 * @returns {string} YYYY-MM-DD
 */
function addDays(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

/**
 * Calculates ISO timestamps relative to today.
 * @param {number} days
 * @returns {string} ISO date-time
 */
function addDaysIso(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

/**
 * Purges all transactional data (preserving users and tenants strictly) and seeds
 * full, production-grade end-to-end dynamic flow data.
 */
export async function seedDatabase() {
  console.log('[Seed] Starting complete database purge & dynamic flow seeding...');

  await withTransaction(async (client) => {
    // -------------------------------------------------------------
    // STEP 1: PURGE ALL TRANSACTIONAL DATA (PRESERVING USERS & TENANTS)
    // -------------------------------------------------------------
    console.log('[Seed] Purging existing transactional data (preserving user accounts)...');
    await client.query('DELETE FROM audit_logs;');
    await client.query('DELETE FROM notification_logs;');
    await client.query('UPDATE documents SET current_version_id = NULL;');
    await client.query('DELETE FROM document_versions;');
    await client.query('DELETE FROM documents;');
    await client.query('DELETE FROM certificates;');
    await client.query('DELETE FROM inspection_submissions;');
    await client.query('DELETE FROM work_orders;');
    await client.query('DELETE FROM payments;');
    await client.query('DELETE FROM invoices;');
    await client.query('DELETE FROM proposals;');
    await client.query('DELETE FROM leads;');
    await client.query('DELETE FROM tenant_counters;');

    // -------------------------------------------------------------
    // STEP 2: TENANT & USERS (PRESERVE OR CREATE)
    // -------------------------------------------------------------
    let tenantRes = await client.query('SELECT id FROM tenants WHERE slug = $1;', ['musadaqah']);
    let tenantId;
    if (tenantRes.rows.length === 0) {
      const insTenant = await client.query(`
        INSERT INTO tenants (name, slug, vat_number, cr_number, address)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id;
      `, [
        'Musadaqah Business Solution',
        'musadaqah',
        '300000000000003',
        '1010101010',
        'King Fahd Road, Al Olaya, Riyadh 12211, Kingdom of Saudi Arabia'
      ]);
      tenantId = insTenant.rows[0].id;
    } else {
      tenantId = tenantRes.rows[0].id;
    }

    // Preserve existing users or create if missing
    const passwordHash = await bcrypt.hash('Demo@123', 10);
    const usersData = [
      { email: 'admin@demo.local', name: 'Demo Admin', role: 'admin', phone: '+966500000001' },
      { email: 'sales@demo.local', name: 'Demo Sales', role: 'sales', phone: '+966500000002' },
      { email: 'engineer@demo.local', name: 'Ahmed', role: 'engineer', phone: '+966500000003' },
      { email: 'engineer2@demo.local', name: 'Faisal', role: 'engineer', phone: '+966500000004' },
      { email: 'finance@demo.local', name: 'Demo Finance', role: 'finance', phone: '+966500000005' },
    ];

    const userMap = {};
    for (const u of usersData) {
      let uRes = await client.query('SELECT id FROM users WHERE tenant_id = $1 AND email = $2;', [tenantId, u.email]);
      if (uRes.rows.length === 0) {
        const insU = await client.query(`
          INSERT INTO users (tenant_id, email, password_hash, name, role, phone, status)
          VALUES ($1, $2, $3, $4, $5, $6, 'active')
          RETURNING id;
        `, [tenantId, u.email, passwordHash, u.name, u.role, u.phone]);
        userMap[u.email] = insU.rows[0].id;
      } else {
        userMap[u.email] = uRes.rows[0].id;
      }
    }

    const adminId = userMap['admin@demo.local'];
    const salesId = userMap['sales@demo.local'];
    const ahmedId = userMap['engineer@demo.local'];
    const faisalId = userMap['engineer2@demo.local'];

    // Initialize serial counters cleanly
    await client.query(`
      INSERT INTO tenant_counters (tenant_id, name, value)
      VALUES 
        ($1, 'work_order', 5),
        ($1, 'invoice', 5),
        ($1, 'certificate', 2),
        ($1, 'proposal', 6)
      ON CONFLICT (tenant_id, name) DO UPDATE SET value = EXCLUDED.value;
    `, [tenantId]);

    // -------------------------------------------------------------
    // STEP 3: INSPECTION CHECKLISTS (Lifting, Forklift, Petroleum, Trailer)
    // -------------------------------------------------------------
    console.log('[Seed] Seeding equipment checklists...');
    const checklistsData = [
      {
        equipment_type: 'lifting',
        items: [
          { key: 'load_test', label: 'Load test dynamic verification under 125% rated load', requires_comment: false },
          { key: 'sling_condition', label: 'Wire rope, hook block and web sling integrity (no frays)', requires_comment: false },
          { key: 'brake_function', label: 'Primary and auxiliary hoist brake holding test under load', requires_comment: false },
          { key: 'limit_switch', label: 'Upper and lower hoist limit switch cutoff operation', requires_comment: false },
          { key: 'operator_license', label: 'Certified crane operator third-party license validity', requires_comment: false }
        ]
      },
      {
        equipment_type: 'forklift',
        items: [
          { key: 'mast_condition', label: 'Mast vertical rails, carriage rollers and lift chain tension balance', requires_comment: false },
          { key: 'hydraulic_leak', label: 'Hydraulic cylinder packing, pump and hose pressure (zero leakage)', requires_comment: false },
          { key: 'horn_lights', label: 'Horn, reversing audible alarm, amber beacon, and LED working headlights', requires_comment: false },
          { key: 'steering_play', label: 'Steering gear play, power assist and rear axle kingpin bearing clearance', requires_comment: false },
          { key: 'fork_thickness', label: 'Fork blade heel and blade tip wear (<10% nominal thickness)', requires_comment: false }
        ]
      },
      {
        equipment_type: 'petroleum',
        items: [
          { key: 'static_ground_wire', label: 'Static grounding reel bonding electrical resistance (<10 Ohms)', requires_comment: false },
          { key: 'valve_seal_integrity', label: 'Internal foot valve and emergency pneumatic shear valve seal test', requires_comment: false },
          { key: 'fire_extinguisher_tag', label: 'Dry chemical powder extinguisher hydrostatic test tag validity', requires_comment: false },
          { key: 'pressure_gauge_calib', label: 'Vessel pressure gauge calibration sticker (<6 months validity)', requires_comment: false },
          { key: 'vapor_recovery', label: 'Vapor recovery hood, camlock fitting and flame arrestor mesh', requires_comment: false }
        ]
      },
      {
        equipment_type: 'trailer',
        items: [
          { key: 'kingpin_wear', label: 'Kingpin 2-inch diameter wear and fifth-wheel lock jaw engagement', requires_comment: false },
          { key: 'air_brake_lines', label: 'Pneumatic dual air lines pressure drop during continuous application', requires_comment: false },
          { key: 'tire_tread_depth', label: 'All trailer axle tire tread depths (>3.2mm) & no sidewall bulging', requires_comment: false },
          { key: 'reflective_tape', label: 'SASO-compliant reflective contour markings on sides and rear bumper', requires_comment: false },
          { key: 'landing_gear', label: 'Two-speed landing gear crank handle, cross-shaft and footpad stability', requires_comment: false }
        ]
      }
    ];

    for (const c of checklistsData) {
      await client.query(`
        INSERT INTO inspection_checklists (tenant_id, equipment_type, items_jsonb)
        VALUES ($1, $2, $3)
        ON CONFLICT (tenant_id, equipment_type) DO UPDATE SET items_jsonb = EXCLUDED.items_jsonb;
      `, [tenantId, c.equipment_type, JSON.stringify(c.items)]);
    }

    // -------------------------------------------------------------
    // STEP 4: PROPOSAL TEMPLATES
    // -------------------------------------------------------------
    const templatesData = [
      {
        type: 'commercial',
        name: 'Standard Commercial Inspection Proposal',
        body_html: `
          <h1>Commercial Inspection Proposal</h1>
          <p>Prepared for: <strong>{{client_name}}</strong></p>
          <p>Scope of Inspection: <strong>{{scope}}</strong></p>
          <p>Inspection Price: <strong>{{amount}} {{currency}}</strong> (Exclusive of 15% VAT)</p>
          <p>This proposal is valid for <strong>{{validity_days}}</strong> calendar days from issuance.</p>
        `
      },
      {
        type: 'technical',
        name: 'Heavy Equipment Technical Inspection Proposal',
        body_html: `
          <h1>Technical Inspection Proposal & Scope</h1>
          <p>Client: <strong>{{client_name}}</strong></p>
          <p>Technical Scope: <strong>{{scope}}</strong></p>
          <p>Total Estimated Fee: <strong>{{amount}} {{currency}}</strong></p>
          <p>Proposal Validity: <strong>{{validity_days}}</strong> days.</p>
        `
      }
    ];

    for (const t of templatesData) {
      let tRes = await client.query('SELECT id FROM proposal_templates WHERE tenant_id = $1 AND type = $2;', [tenantId, t.type]);
      if (tRes.rows.length === 0) {
        await client.query(`
          INSERT INTO proposal_templates (tenant_id, type, name, body_html)
          VALUES ($1, $2, $3, $4);
        `, [tenantId, t.type, t.name, t.body_html]);
      }
    }

    // -------------------------------------------------------------
    // STEP 5: DMS DOCUMENTS & VERSIONS (COMPANY & ENGINEER VAULT)
    // -------------------------------------------------------------
    console.log('[Seed] Seeding DMS documents with version history and real PDFs...');

    async function seedDmsDoc({ category, ownerId, docType, displayName, expiryDate, fileName, title, v2FileName, v2Title }) {
      const isExpired = expiryDate && new Date(expiryDate) < new Date();
      const status = isExpired ? 'expired' : 'active';

      const insDoc = await client.query(`
        INSERT INTO documents (tenant_id, category, owner_user_id, document_type, display_name, expiry_date, status)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING id;
      `, [tenantId, category, ownerId || null, docType, displayName, expiryDate, status]);
      const docId = insDoc.rows[0].id;

      // v1 PDF
      const pdfBuf1 = await createSamplePdf(title, `Document Ref: ${docType} (Version 1.0)`);
      const key1 = `documents/${tenantId}/${docId}/v1_${fileName}`;
      await storage.put(key1, pdfBuf1, 'application/pdf');

      const insVer1 = await client.query(`
        INSERT INTO document_versions (document_id, version_number, storage_key, file_name, mime_type, file_size, uploaded_by)
        VALUES ($1, 1, $2, $3, 'application/pdf', $4, $5)
        RETURNING id;
      `, [docId, key1, fileName, pdfBuf1.length, adminId]);
      let currentVersionId = insVer1.rows[0].id;

      // Optional v2
      if (v2FileName && v2Title) {
        const pdfBuf2 = await createSamplePdf(v2Title, `Document Ref: ${docType} (Version 2.0 - Renewed)`);
        const key2 = `documents/${tenantId}/${docId}/v2_${v2FileName}`;
        await storage.put(key2, pdfBuf2, 'application/pdf');

        const insVer2 = await client.query(`
          INSERT INTO document_versions (document_id, version_number, storage_key, file_name, mime_type, file_size, uploaded_by)
          VALUES ($1, 2, $2, $3, 'application/pdf', $4, $5)
          RETURNING id;
        `, [docId, key2, v2FileName, pdfBuf2.length, adminId]);
        currentVersionId = insVer2.rows[0].id;
      }

      await client.query('UPDATE documents SET current_version_id = $1 WHERE id = $2;', [currentVersionId, docId]);
      return docId;
    }

    // Company Documents
    await seedDmsDoc({
      category: 'company',
      ownerId: null,
      docType: 'CR',
      displayName: 'Commercial Registration (CR) - Musadaqah',
      expiryDate: addDays(180),
      fileName: 'cr_v1.pdf',
      title: 'Commercial Registration - Musadaqah Business Solution',
      v2FileName: 'cr_v2_renewed.pdf',
      v2Title: 'Commercial Registration (Ministry of Commerce Renewal)'
    });

    await seedDmsDoc({
      category: 'company',
      ownerId: null,
      docType: 'VAT_CERTIFICATE',
      displayName: 'ZATCA Tax VAT Registration Certificate',
      expiryDate: addDays(4), // Expiring in 4 days -> triggers dashboard widget!
      fileName: 'zatca_vat_cert.pdf',
      title: 'Zakat, Tax and Customs Authority - VAT Registration Certificate'
    });

    await seedDmsDoc({
      category: 'company',
      ownerId: null,
      docType: 'ISO_17020',
      displayName: 'ISO/IEC 17020 Accreditation Certificate',
      expiryDate: addDays(320),
      fileName: 'iso_17020_accreditation.pdf',
      title: 'ISO/IEC 17020 Inspection Body Accreditation'
    });

    await seedDmsDoc({
      category: 'company',
      ownerId: null,
      docType: 'INSURANCE_POLICY',
      displayName: 'Third-Party Industrial Liability Insurance',
      expiryDate: addDays(90),
      fileName: 'general_liability_policy.pdf',
      title: 'Comprehensive General Liability Policy - Tawuniya'
    });

    // Engineer Documents: Ahmed (IQAMA EXPIRED 2 days ago -> Demonstrates Gate-Pass Denied!)
    await seedDmsDoc({
      category: 'engineer',
      ownerId: ahmedId,
      docType: 'IQAMA',
      displayName: 'National Resident ID (IQAMA) - Ahmed',
      expiryDate: addDays(-2), // EXPIRED!
      fileName: 'ahmed_iqama.pdf',
      title: 'Kingdom of Saudi Arabia Resident Identity (IQAMA) - Ahmed'
    });

    await seedDmsDoc({
      category: 'engineer',
      ownerId: ahmedId,
      docType: 'driving_license',
      displayName: 'Heavy Equipment Operator Driving License - Ahmed',
      expiryDate: addDays(120),
      fileName: 'ahmed_heavy_license.pdf',
      title: 'Saudi Traffic Directorate - Heavy Driving License'
    });

    // Engineer Documents: Faisal (ALL VALID credentials)
    await seedDmsDoc({
      category: 'engineer',
      ownerId: faisalId,
      docType: 'IQAMA',
      displayName: 'National Resident ID (IQAMA) - Faisal',
      expiryDate: addDays(90),
      fileName: 'faisal_iqama.pdf',
      title: 'Kingdom of Saudi Arabia Resident Identity (IQAMA) - Faisal'
    });

    await seedDmsDoc({
      category: 'engineer',
      ownerId: faisalId,
      docType: 'driving_license',
      displayName: 'Heavy Vehicle Driving License - Faisal',
      expiryDate: addDays(60),
      fileName: 'faisal_license.pdf',
      title: 'Saudi Traffic Directorate - Heavy Driving License'
    });

    await seedDmsDoc({
      category: 'engineer',
      ownerId: faisalId,
      docType: 'car_registration',
      displayName: 'Vehicle Registration (Istemara) - Inspection Cruiser',
      expiryDate: addDays(18), // Expiring in 18 days
      fileName: 'faisal_istemara.pdf',
      title: 'Ministry of Interior - Vehicle Registration (Istemara)'
    });

    await seedDmsDoc({
      category: 'engineer',
      ownerId: faisalId,
      docType: 'aramco_gate_pass',
      displayName: 'Saudi Aramco High-Risk Work Plant Gate Pass',
      expiryDate: addDays(150),
      fileName: 'faisal_aramco_pass.pdf',
      title: 'Saudi Aramco Industrial Security Gate Pass'
    });

    // -------------------------------------------------------------
    // STEP 6: SEED 5 CONNECTED END-TO-END FLOW ACCOUNTS
    // -------------------------------------------------------------
    console.log('[Seed] Seeding 5 authentic connected Saudi industrial inspection flows...');

    // -------------------------------------------------------------
    // FLOW 1: Saudi Aramco Logistics Contractor (Ras Tanura) -> Fully Certified SAFE
    // -------------------------------------------------------------
    const lead1Res = await client.query(`
      INSERT INTO leads (tenant_id, source, client_name, contact_email, contact_phone, status, assigned_to, notes)
      VALUES ($1, 'whatsapp', 'Saudi Aramco Logistics Contractor', 'procurement@aramco-logistics.sa', '+966138760001', 'converted', $2, 'Fleet crane inspection at Ras Tanura Marine Terminal.')
      RETURNING id;
    `, [tenantId, salesId]);
    const lead1Id = lead1Res.rows[0].id;

    const prop1Content = {
      client_name: 'Saudi Aramco Logistics Contractor',
      scope: 'Annual 125% dynamic proof load test and ultrasonic magnetic particle inspection on 50-Ton crawler crane and hook block.',
      amount: '18500.00',
      currency: 'SAR',
      validity_days: 30
    };
    const prop1PdfBuf = await renderProposalPdf({
      proposalId: 'PRP-000001',
      clientName: prop1Content.client_name,
      scope: prop1Content.scope,
      amount: prop1Content.amount,
      currency: prop1Content.currency,
      validityDays: prop1Content.validity_days,
      type: 'technical'
    });
    const prop1Key = `proposals/${tenantId}/PRP-000001.pdf`;
    await storage.put(prop1Key, prop1PdfBuf, 'application/pdf');

    const token1 = crypto.randomBytes(32).toString('hex');
    const tokenHash1 = crypto.createHash('sha256').update(token1).digest('hex');

    const prop1Res = await client.query(`
      INSERT INTO proposals (
        tenant_id, lead_id, type, status, content_jsonb, pdf_key,
        access_token_hash, access_token_expires_at, accepted_at, accepted_by_email
      ) VALUES ($1, $2, 'technical', 'accepted', $3, $4, $5, $6, now() - INTERVAL '5 days', 'procurement@aramco-logistics.sa')
      RETURNING id;
    `, [tenantId, lead1Id, JSON.stringify(prop1Content), prop1Key, tokenHash1, addDaysIso(25)]);
    const prop1Id = prop1Res.rows[0].id;

    // Invoice 1
    const inv1Subtotal = 18500.00;
    const inv1Vat = 2775.00;
    const inv1Total = 21275.00;
    const zatca1Uuid = crypto.randomUUID();
    const zatca1Hash = crypto.createHash('sha256').update(JSON.stringify({ num: 'INV-000001', total: inv1Total, uuid: zatca1Uuid })).digest('hex');

    const inv1Res = await client.query(`
      INSERT INTO invoices (
        tenant_id, invoice_number, proposal_id, client_jsonb, line_items_jsonb,
        subtotal, vat_amount, total, currency, status, zatca_uuid, zatca_hash
      ) VALUES (
        $1, 'INV-000001', $2,
        $3,
        $4,
        $5, $6, $7, 'SAR', 'paid', $8, $9
      ) RETURNING id;
    `, [
      tenantId, prop1Id,
      JSON.stringify({ client_name: 'Saudi Aramco Logistics Contractor', contact_email: 'procurement@aramco-logistics.sa', contact_phone: '+966138760001' }),
      JSON.stringify([{ description: prop1Content.scope, amount: inv1Subtotal }]),
      inv1Subtotal, inv1Vat, inv1Total, zatca1Uuid, zatca1Hash
    ]);
    const inv1Id = inv1Res.rows[0].id;

    // Payment 1
    await client.query(`
      INSERT INTO payments (tenant_id, invoice_id, gateway, amount, currency, status, idempotency_key)
      VALUES ($1, $2, 'mock', $3, 'SAR', 'succeeded', $4);
    `, [tenantId, inv1Id, inv1Total, 'pay_aramco_001']);

    // Work Order 1 (Closed)
    const wo1Res = await client.query(`
      INSERT INTO work_orders (
        tenant_id, wo_number, proposal_id, invoice_id, client_name, client_email, client_phone,
        location_text, google_maps_url, inspection_location, service_type, inspection_category,
        scope, certificate_validity_days, status, assigned_engineer_id, due_date
      ) VALUES (
        $1, 'WO-000001', $2, $3, 'Saudi Aramco Logistics Contractor', 'procurement@aramco-logistics.sa', '+966138760001',
        'Ras Tanura Marine Terminal, Berth 4', 'https://maps.google.com/?q=26.6436,50.1585', 'Ras Tanura Terminal',
        'Proof Load & NDT Safety Certification', 'lifting', $4, 365, 'closed', $5, CURRENT_DATE - INTERVAL '2 days'
      ) RETURNING id;
    `, [tenantId, prop1Id, inv1Id, prop1Content.scope, faisalId]);
    const wo1Id = wo1Res.rows[0].id;

    // Inspection Submission 1 (SAFE)
    const eq1 = {
      manufacturer: 'Liebherr',
      model: 'LR 11000 Heavy Lift Crawler',
      serial: 'ARAMCO-CR-99214',
      year: 2021,
      capacity: '50-Ton Rated Dynamic'
    };
    const sub1Res = await client.query(`
      INSERT INTO inspection_submissions (
        tenant_id, work_order_id, engineer_id, answers_jsonb, equipment_jsonb, result, notes
      ) VALUES (
        $1, $2, $3,
        $4,
        $5,
        'safe',
        'Dynamic proof load test executed up to 62.5 Tonnes (125% rated load). Hoist brake held without slip. Deflection within allowable SASO tolerances.'
      ) RETURNING id;
    `, [
      tenantId, wo1Id, faisalId,
      JSON.stringify({ load_test: 'yes', sling_condition: 'yes', brake_function: 'yes', limit_switch: 'yes', operator_license: 'yes' }),
      JSON.stringify(eq1)
    ]);
    const sub1Id = sub1Res.rows[0].id;

    // Certificate 1 (Valid Active Certificate + QR + PDF)
    const cert1Id = crypto.randomUUID();
    const qrJwt1 = await signVerifyToken({ certId: cert1Id, serial: eq1.serial, ttlDays: 365 });
    const verifyUrl1 = `${config.WEB_BASE_URL}/verify/${qrJwt1}`;
    const qrPngBuf1 = await generateQrBuffer(verifyUrl1);
    const cert1ExpiresAt = addDaysIso(365);

    const cert1PdfBuf = await renderCertificatePdf({
      certificateNumber: 'CERT-2026-000001',
      certificateType: 'Safety Compliance Certificate',
      equipmentSerial: eq1.serial,
      inspectingCompanyName: 'Musadaqah Business Solution',
      issuedAt: new Date().toISOString(),
      expiresAt: cert1ExpiresAt,
      equipment: eq1,
      verifyUrl: verifyUrl1
    }, qrPngBuf1);
    const cert1StorageKey = `certificates/${tenantId}/${cert1Id}.pdf`;
    await storage.put(cert1StorageKey, cert1PdfBuf, 'application/pdf');

    await client.query(`
      INSERT INTO certificates (
        id, tenant_id, work_order_id, inspection_submission_id, certificate_number, certificate_type,
        equipment_serial, status, issued_at, expires_at, equipment_jsonb, inspecting_company_name, qr_payload, pdf_key
      ) VALUES (
        $1, $2, $3, $4, 'CERT-2026-000001', 'safety_compliance',
        $5, 'issued', now(), $6, $7, 'Musadaqah Business Solution', $8, $9
      );
    `, [cert1Id, tenantId, wo1Id, sub1Id, eq1.serial, cert1ExpiresAt, JSON.stringify(eq1), qrJwt1, cert1StorageKey]);

    // -------------------------------------------------------------
    // FLOW 2: SABIC Petrochemical Industries (Jubail) -> EXPIRING IN 6 DAYS (Drives 7-day Alert!)
    // -------------------------------------------------------------
    const lead2Res = await client.query(`
      INSERT INTO leads (tenant_id, source, client_name, contact_email, contact_phone, status, assigned_to, notes)
      VALUES ($1, 'email', 'SABIC Petrochemicals Industrial Complex', 'inspection@sabic.com.sa', '+966133590002', 'converted', $2, 'Tri-Axle Chemical Tanker semi-trailer annual recertification.')
      RETURNING id;
    `, [tenantId, salesId]);
    const lead2Id = lead2Res.rows[0].id;

    const prop2Content = {
      client_name: 'SABIC Petrochemicals Industrial Complex',
      scope: 'Annual hydrostatic pressure & vapor recovery inspection on 38,000L chemical tanker semi-trailer.',
      amount: '12000.00',
      currency: 'SAR',
      validity_days: 30
    };
    const prop2PdfBuf = await renderProposalPdf({
      proposalId: 'PRP-000002',
      clientName: prop2Content.client_name,
      scope: prop2Content.scope,
      amount: prop2Content.amount,
      currency: prop2Content.currency,
      validityDays: prop2Content.validity_days,
      type: 'commercial'
    });
    const prop2Key = `proposals/${tenantId}/PRP-000002.pdf`;
    await storage.put(prop2Key, prop2PdfBuf, 'application/pdf');

    const token2 = crypto.randomBytes(32).toString('hex');
    const tokenHash2 = crypto.createHash('sha256').update(token2).digest('hex');

    const prop2Res = await client.query(`
      INSERT INTO proposals (
        tenant_id, lead_id, type, status, content_jsonb, pdf_key,
        access_token_hash, access_token_expires_at, accepted_at, accepted_by_email
      ) VALUES ($1, $2, 'commercial', 'accepted', $3, $4, $5, $6, now() - INTERVAL '350 days', 'inspection@sabic.com.sa')
      RETURNING id;
    `, [tenantId, lead2Id, JSON.stringify(prop2Content), prop2Key, tokenHash2, addDaysIso(10)]);
    const prop2Id = prop2Res.rows[0].id;

    // Invoice 2
    const inv2Subtotal = 12000.00;
    const inv2Vat = 1800.00;
    const inv2Total = 13800.00;
    const zatca2Uuid = crypto.randomUUID();
    const zatca2Hash = crypto.createHash('sha256').update(JSON.stringify({ num: 'INV-000002', total: inv2Total, uuid: zatca2Uuid })).digest('hex');

    const inv2Res = await client.query(`
      INSERT INTO invoices (
        tenant_id, invoice_number, proposal_id, client_jsonb, line_items_jsonb,
        subtotal, vat_amount, total, currency, status, zatca_uuid, zatca_hash
      ) VALUES (
        $1, 'INV-000002', $2,
        $3,
        $4,
        $5, $6, $7, 'SAR', 'paid', $8, $9
      ) RETURNING id;
    `, [
      tenantId, prop2Id,
      JSON.stringify({ client_name: 'SABIC Petrochemicals Industrial Complex', contact_email: 'inspection@sabic.com.sa', contact_phone: '+966133590002' }),
      JSON.stringify([{ description: prop2Content.scope, amount: inv2Subtotal }]),
      inv2Subtotal, inv2Vat, inv2Total, zatca2Uuid, zatca2Hash
    ]);
    const inv2Id = inv2Res.rows[0].id;

    await client.query(`
      INSERT INTO payments (tenant_id, invoice_id, gateway, amount, currency, status, idempotency_key)
      VALUES ($1, $2, 'mock', $3, 'SAR', 'succeeded', $4);
    `, [tenantId, inv2Id, inv2Total, 'pay_sabic_002']);

    // Work Order 2 (Completed)
    const wo2Res = await client.query(`
      INSERT INTO work_orders (
        tenant_id, wo_number, proposal_id, invoice_id, client_name, client_email, client_phone,
        location_text, google_maps_url, inspection_location, service_type, inspection_category,
        scope, certificate_validity_days, status, assigned_engineer_id, due_date
      ) VALUES (
        $1, 'WO-000002', $2, $3, 'SABIC Petrochemicals Industrial Complex', 'inspection@sabic.com.sa', '+966133590002',
        'Jubail Industrial City, Support Industrial Area 2', 'https://maps.google.com/?q=27.0174,49.6225', 'Jubail Industrial City',
        'Petroleum Tanker Hazardous Certification', 'petroleum', $4, 365, 'completed', $5, CURRENT_DATE - INTERVAL '1 day'
      ) RETURNING id;
    `, [tenantId, prop2Id, inv2Id, prop2Content.scope, faisalId]);
    const wo2Id = wo2Res.rows[0].id;

    // Inspection Submission 2 (SAFE)
    const eq2 = {
      manufacturer: 'Heil Trailer',
      model: 'Aluminum Chemical Tanker',
      serial: 'SABIC-TANK-4412',
      year: 2020,
      capacity: '38,000 Liters Tri-Axle'
    };
    const sub2Res = await client.query(`
      INSERT INTO inspection_submissions (
        tenant_id, work_order_id, engineer_id, answers_jsonb, equipment_jsonb, result, notes
      ) VALUES (
        $1, $2, $3,
        $4,
        $5,
        'safe',
        'Hydrostatic test held at 3.5 bar with zero pressure drop. Static grounding bonding resistance verified at 4.2 Ohms.'
      ) RETURNING id;
    `, [
      tenantId, wo2Id, faisalId,
      JSON.stringify({ static_ground_wire: 'yes', valve_seal_integrity: 'yes', fire_extinguisher_tag: 'yes', pressure_gauge_calib: 'yes', vapor_recovery: 'yes' }),
      JSON.stringify(eq2)
    ]);
    const sub2Id = sub2Res.rows[0].id;

    // Certificate 2: Expiring in +6 days!
    const cert2Id = crypto.randomUUID();
    const qrJwt2 = await signVerifyToken({ certId: cert2Id, serial: eq2.serial, ttlDays: 6 });
    const verifyUrl2 = `${config.WEB_BASE_URL}/verify/${qrJwt2}`;
    const qrPngBuf2 = await generateQrBuffer(verifyUrl2);
    const cert2ExpiresAt = addDaysIso(6); // Expiring in 6 days!

    const cert2PdfBuf = await renderCertificatePdf({
      certificateNumber: 'CERT-2026-000002',
      certificateType: 'Environmental Conformance Certificate',
      equipmentSerial: eq2.serial,
      inspectingCompanyName: 'Musadaqah Business Solution',
      issuedAt: new Date(Date.now() - 359 * 24 * 3600 * 1000).toISOString(),
      expiresAt: cert2ExpiresAt,
      equipment: eq2,
      verifyUrl: verifyUrl2
    }, qrPngBuf2);
    const cert2StorageKey = `certificates/${tenantId}/${cert2Id}.pdf`;
    await storage.put(cert2StorageKey, cert2PdfBuf, 'application/pdf');

    await client.query(`
      INSERT INTO certificates (
        id, tenant_id, work_order_id, inspection_submission_id, certificate_number, certificate_type,
        equipment_serial, status, issued_at, expires_at, equipment_jsonb, inspecting_company_name, qr_payload, pdf_key
      ) VALUES (
        $1, $2, $3, $4, 'CERT-2026-000002', 'environmental_conformance',
        $5, 'issued', now() - INTERVAL '359 days', $6, $7, 'Musadaqah Business Solution', $8, $9
      );
    `, [cert2Id, tenantId, wo2Id, sub2Id, eq2.serial, cert2ExpiresAt, JSON.stringify(eq2), qrJwt2, cert2StorageKey]);

    // -------------------------------------------------------------
    // FLOW 3: Red Sea Global Infrastructure (Umluj) -> UNSAFE (Strict Rule: NO CERTIFICATE)
    // -------------------------------------------------------------
    const lead3Res = await client.query(`
      INSERT INTO leads (tenant_id, source, client_name, contact_email, contact_phone, status, assigned_to, notes)
      VALUES ($1, 'website', 'Red Sea Global Infrastructure Co.', 'qa@redseaglobal.sa', '+966144220003', 'converted', $2, '80-Ton Rough-Terrain Crane inspection at Umluj Coastal Base.')
      RETURNING id;
    `, [tenantId, salesId]);
    const lead3Id = lead3Res.rows[0].id;

    const prop3Content = {
      client_name: 'Red Sea Global Infrastructure Co.',
      scope: 'Annual safety inspection and crane load limiter verification on Grove RT-880E.',
      amount: '24000.00',
      currency: 'SAR',
      validity_days: 30
    };
    const prop3PdfBuf = await renderProposalPdf({
      proposalId: 'PRP-000003',
      clientName: prop3Content.client_name,
      scope: prop3Content.scope,
      amount: prop3Content.amount,
      currency: prop3Content.currency,
      validityDays: prop3Content.validity_days,
      type: 'technical'
    });
    const prop3Key = `proposals/${tenantId}/PRP-000003.pdf`;
    await storage.put(prop3Key, prop3PdfBuf, 'application/pdf');

    const token3 = crypto.randomBytes(32).toString('hex');
    const tokenHash3 = crypto.createHash('sha256').update(token3).digest('hex');

    const prop3Res = await client.query(`
      INSERT INTO proposals (
        tenant_id, lead_id, type, status, content_jsonb, pdf_key,
        access_token_hash, access_token_expires_at, accepted_at, accepted_by_email
      ) VALUES ($1, $2, 'technical', 'accepted', $3, $4, $5, $6, now() - INTERVAL '3 days', 'qa@redseaglobal.sa')
      RETURNING id;
    `, [tenantId, lead3Id, JSON.stringify(prop3Content), prop3Key, tokenHash3, addDaysIso(27)]);
    const prop3Id = prop3Res.rows[0].id;

    const inv3Total = 27600.00;
    const zatca3Uuid = crypto.randomUUID();
    const zatca3Hash = crypto.createHash('sha256').update(JSON.stringify({ num: 'INV-000003', total: inv3Total, uuid: zatca3Uuid })).digest('hex');

    const inv3Res = await client.query(`
      INSERT INTO invoices (
        tenant_id, invoice_number, proposal_id, client_jsonb, line_items_jsonb,
        subtotal, vat_amount, total, currency, status, zatca_uuid, zatca_hash
      ) VALUES (
        $1, 'INV-000003', $2,
        $3, $4, 24000.00, 3600.00, $5, 'SAR', 'paid', $6, $7
      ) RETURNING id;
    `, [
      tenantId, prop3Id,
      JSON.stringify({ client_name: 'Red Sea Global Infrastructure Co.', contact_email: 'qa@redseaglobal.sa', contact_phone: '+966144220003' }),
      JSON.stringify([{ description: prop3Content.scope, amount: 24000.00 }]),
      inv3Total, zatca3Uuid, zatca3Hash
    ]);
    const inv3Id = inv3Res.rows[0].id;

    await client.query(`
      INSERT INTO payments (tenant_id, invoice_id, gateway, amount, currency, status, idempotency_key)
      VALUES ($1, $2, 'mock', $3, 'SAR', 'succeeded', $4);
    `, [tenantId, inv3Id, inv3Total, 'pay_redsea_003']);

    // Work Order 3 (Completed with Unsafe Outcome)
    const wo3Res = await client.query(`
      INSERT INTO work_orders (
        tenant_id, wo_number, proposal_id, invoice_id, client_name, client_email, client_phone,
        location_text, google_maps_url, inspection_location, service_type, inspection_category,
        scope, certificate_validity_days, status, assigned_engineer_id, due_date
      ) VALUES (
        $1, 'WO-000003', $2, $3, 'Red Sea Global Infrastructure Co.', 'qa@redseaglobal.sa', '+966144220003',
        'Umluj Southern Coastal Development Zone, Berth 2', 'https://maps.google.com/?q=25.0298,37.2625', 'Umluj Coastal Base',
        'Heavy Lifting Structural Certification', 'lifting', $4, 365, 'completed', $5, CURRENT_DATE
      ) RETURNING id;
    `, [tenantId, prop3Id, inv3Id, prop3Content.scope, faisalId]);
    const wo3Id = wo3Res.rows[0].id;

    // Inspection Submission 3 (UNSAFE - Fails Hoist Brake Test)
    const eq3 = {
      manufacturer: 'Grove / Manitowoc',
      model: 'RT-880E Rough-Terrain',
      serial: 'RSG-CRANE-7781',
      year: 2019,
      capacity: '80-Ton Hydraulic'
    };
    await client.query(`
      INSERT INTO inspection_submissions (
        tenant_id, work_order_id, engineer_id, answers_jsonb, equipment_jsonb, result, notes
      ) VALUES (
        $1, $2, $3,
        $4,
        $5,
        'unsafe',
        'DEFECT DETECTED: Auxiliary hoist hydraulic caliper disc brake slippage under 100% test load. Crack detected on boom base pivot pin. Equipment condemned until mechanical rebuild.'
      );
    `, [
      tenantId, wo3Id, faisalId,
      JSON.stringify({ load_test: 'yes', sling_condition: 'yes', brake_function: 'no', limit_switch: 'yes', operator_license: 'yes' }),
      JSON.stringify(eq3)
    ]);
    // NO CERTIFICATE ISSUED (Demonstrating safety integrity rule!)

    // -------------------------------------------------------------
    // FLOW 4: NEOM Heavy Transport & Logistics Hub -> IN PROGRESS (Engineer Dispatched)
    // -------------------------------------------------------------
    const lead4Res = await client.query(`
      INSERT INTO leads (tenant_id, source, client_name, contact_email, contact_phone, status, assigned_to, notes)
      VALUES ($1, 'manual', 'NEOM Heavy Transport & Logistics Hub', 'fleet@neom-transport.sa', '+966145110004', 'converted', $2, 'Flatbed fleet SASO roadworthiness inspection.')
      RETURNING id;
    `, [tenantId, salesId]);
    const lead4Id = lead4Res.rows[0].id;

    const prop4Content = {
      client_name: 'NEOM Heavy Transport & Logistics Hub',
      scope: 'Fleet inspection and SASO roadworthiness audit for 10 heavy flatbed cargo trailers.',
      amount: '35000.00',
      currency: 'SAR',
      validity_days: 30
    };
    const prop4PdfBuf = await renderProposalPdf({
      proposalId: 'PRP-000004',
      clientName: prop4Content.client_name,
      scope: prop4Content.scope,
      amount: prop4Content.amount,
      currency: prop4Content.currency,
      validityDays: prop4Content.validity_days,
      type: 'commercial'
    });
    const prop4Key = `proposals/${tenantId}/PRP-000004.pdf`;
    await storage.put(prop4Key, prop4PdfBuf, 'application/pdf');

    const token4 = crypto.randomBytes(32).toString('hex');
    const tokenHash4 = crypto.createHash('sha256').update(token4).digest('hex');

    const prop4Res = await client.query(`
      INSERT INTO proposals (
        tenant_id, lead_id, type, status, content_jsonb, pdf_key,
        access_token_hash, access_token_expires_at, accepted_at, accepted_by_email
      ) VALUES ($1, $2, 'commercial', 'accepted', $3, $4, $5, $6, now() - INTERVAL '1 day', 'fleet@neom-transport.sa')
      RETURNING id;
    `, [tenantId, lead4Id, JSON.stringify(prop4Content), prop4Key, tokenHash4, addDaysIso(29)]);
    const prop4Id = prop4Res.rows[0].id;

    const inv4Total = 40250.00;
    const zatca4Uuid = crypto.randomUUID();
    const zatca4Hash = crypto.createHash('sha256').update(JSON.stringify({ num: 'INV-000004', total: inv4Total, uuid: zatca4Uuid })).digest('hex');

    const inv4Res = await client.query(`
      INSERT INTO invoices (
        tenant_id, invoice_number, proposal_id, client_jsonb, line_items_jsonb,
        subtotal, vat_amount, total, currency, status, zatca_uuid, zatca_hash
      ) VALUES (
        $1, 'INV-000004', $2,
        $3, $4, 35000.00, 5250.00, $5, 'SAR', 'paid', $6, $7
      ) RETURNING id;
    `, [
      tenantId, prop4Id,
      JSON.stringify({ client_name: 'NEOM Heavy Transport & Logistics Hub', contact_email: 'fleet@neom-transport.sa', contact_phone: '+966145110004' }),
      JSON.stringify([{ description: prop4Content.scope, amount: 35000.00 }]),
      inv4Total, zatca4Uuid, zatca4Hash
    ]);
    const inv4Id = inv4Res.rows[0].id;

    await client.query(`
      INSERT INTO payments (tenant_id, invoice_id, gateway, amount, currency, status, idempotency_key)
      VALUES ($1, $2, 'mock', $3, 'SAR', 'succeeded', $4);
    `, [tenantId, inv4Id, inv4Total, 'pay_neom_004']);

    // Work Order 4 (In Progress, assigned to Faisal)
    await client.query(`
      INSERT INTO work_orders (
        tenant_id, wo_number, proposal_id, invoice_id, client_name, client_email, client_phone,
        location_text, google_maps_url, inspection_location, service_type, inspection_category,
        scope, certificate_validity_days, status, assigned_engineer_id, due_date
      ) VALUES (
        $1, 'WO-000004', $2, $3, 'NEOM Heavy Transport & Logistics Hub', 'fleet@neom-transport.sa', '+966145110004',
        'NEOM Logistics Core Depot, Sharma Site A', 'https://maps.google.com/?q=28.0264,35.2155', 'NEOM Logistics Depot',
        'SASO Heavy Vehicle Fleet Verification', 'trailer', $4, 365, 'in_progress', $5, CURRENT_DATE + INTERVAL '3 days'
      );
    `, [tenantId, prop4Id, inv4Id, prop4Content.scope, faisalId]);

    // -------------------------------------------------------------
    // FLOW 5: Ma'aden Phosphate Mining Co. -> OPEN (Enables Testing Gate-Pass Denied)
    // -------------------------------------------------------------
    const lead5Res = await client.query(`
      INSERT INTO leads (tenant_id, source, client_name, contact_email, contact_phone, status, assigned_to, notes)
      VALUES ($1, 'manual', 'Ma''aden Phosphate & Mining Co.', 'maintenance@maaden.com.sa', '+966146600005', 'converted', $2, 'Forklift fleet proof testing at Wa''ad Al Shamal.')
      RETURNING id;
    `, [tenantId, salesId]);
    const lead5Id = lead5Res.rows[0].id;

    const prop5Content = {
      client_name: "Ma'aden Phosphate & Mining Co.",
      scope: 'Annual dynamic proof load test and mast chain inspection on 5-Ton mining forklifts.',
      amount: '15000.00',
      currency: 'SAR',
      validity_days: 30
    };
    const prop5PdfBuf = await renderProposalPdf({
      proposalId: 'PRP-000005',
      clientName: prop5Content.client_name,
      scope: prop5Content.scope,
      amount: prop5Content.amount,
      currency: prop5Content.currency,
      validityDays: prop5Content.validity_days,
      type: 'commercial'
    });
    const prop5Key = `proposals/${tenantId}/PRP-000005.pdf`;
    await storage.put(prop5Key, prop5PdfBuf, 'application/pdf');

    const token5 = crypto.randomBytes(32).toString('hex');
    const tokenHash5 = crypto.createHash('sha256').update(token5).digest('hex');

    const prop5Res = await client.query(`
      INSERT INTO proposals (
        tenant_id, lead_id, type, status, content_jsonb, pdf_key,
        access_token_hash, access_token_expires_at, accepted_at, accepted_by_email
      ) VALUES ($1, $2, 'commercial', 'accepted', $3, $4, $5, $6, now(), 'maintenance@maaden.com.sa')
      RETURNING id;
    `, [tenantId, lead5Id, JSON.stringify(prop5Content), prop5Key, tokenHash5, addDaysIso(30)]);
    const prop5Id = prop5Res.rows[0].id;

    const inv5Total = 17250.00;
    const zatca5Uuid = crypto.randomUUID();
    const zatca5Hash = crypto.createHash('sha256').update(JSON.stringify({ num: 'INV-000005', total: inv5Total, uuid: zatca5Uuid })).digest('hex');

    const inv5Res = await client.query(`
      INSERT INTO invoices (
        tenant_id, invoice_number, proposal_id, client_jsonb, line_items_jsonb,
        subtotal, vat_amount, total, currency, status, zatca_uuid, zatca_hash
      ) VALUES (
        $1, 'INV-000005', $2,
        $3, $4, 15000.00, 2250.00, $5, 'SAR', 'paid', $6, $7
      ) RETURNING id;
    `, [
      tenantId, prop5Id,
      JSON.stringify({ client_name: "Ma'aden Phosphate & Mining Co.", contact_email: 'maintenance@maaden.com.sa', contact_phone: '+966146600005' }),
      JSON.stringify([{ description: prop5Content.scope, amount: 15000.00 }]),
      inv5Total, zatca5Uuid, zatca5Hash
    ]);
    const inv5Id = inv5Res.rows[0].id;

    await client.query(`
      INSERT INTO payments (tenant_id, invoice_id, gateway, amount, currency, status, idempotency_key)
      VALUES ($1, $2, 'mock', $3, 'SAR', 'succeeded', $4);
    `, [tenantId, inv5Id, inv5Total, 'pay_maaden_005']);

    // Work Order 5 (Open, awaiting assignment -> Perfect for Gate-Pass Denied testing in UI!)
    await client.query(`
      INSERT INTO work_orders (
        tenant_id, wo_number, proposal_id, invoice_id, client_name, client_email, client_phone,
        location_text, google_maps_url, inspection_location, service_type, inspection_category,
        scope, certificate_validity_days, status, due_date
      ) VALUES (
        $1, 'WO-000005', $2, $3, 'Ma''aden Phosphate & Mining Co.', 'maintenance@maaden.com.sa', '+966146600005',
        'Wa''ad Al Shamal Mining Complex, Plant B', 'https://maps.google.com/?q=31.6367,38.5638', 'Wa''ad Al Shamal Mining Complex',
        'Industrial Forklift Proof Load & Mast Safety', 'forklift', $4, 365, 'open', CURRENT_DATE + INTERVAL '7 days'
      );
    `, [tenantId, prop5Id, inv5Id, prop5Content.scope]);

    // -------------------------------------------------------------
    // STEP 7: ADDITIONAL ACTIVE LEADS & SENT PROPOSALS
    // -------------------------------------------------------------
    console.log('[Seed] Seeding pipeline leads and pending proposals...');

    // Lead 6: New (WhatsApp)
    await client.query(`
      INSERT INTO leads (tenant_id, source, client_name, contact_email, contact_phone, status, assigned_to, notes)
      VALUES ($1, 'whatsapp', 'PetroRabigh Refining & Petrochemical', 'contracting@petrorabigh.com', '+966124230006', 'new', $2, 'Initial inquiry received via WhatsApp business line for refinery storage tank ultrasonic NDT.');
    `, [tenantId, salesId]);

    // Lead 7: Contacted (Website)
    await client.query(`
      INSERT INTO leads (tenant_id, source, client_name, contact_email, contact_phone, status, assigned_to, notes)
      VALUES ($1, 'website', 'Bahri National Shipping Co. of Saudi Arabia', 'vessels@bahri.sa', '+966114780007', 'contacted', $2, 'Web portal quote inquiry. Sales contacted ship management department.');
    `, [tenantId, salesId]);

    const lead8Res = await client.query(`
      INSERT INTO leads (tenant_id, source, client_name, contact_email, contact_phone, status, assigned_to, notes)
      VALUES ($1, 'email', 'Alfanar Industrial Construction', 'bids@alfanar.com', '+966119400008', 'proposal_sent', $2, 'Formal commercial proposal sent with secure client link. Awaiting digital client acceptance.')
      RETURNING id;
    `, [tenantId, salesId]);
    const lead8Id = lead8Res.rows[0].id;

    const prop6Content = {
      client_name: 'Alfanar Industrial Construction',
      scope: 'Statutory proof load testing on 4 overhead traveling gantry cranes at electrical switchgear factory.',
      amount: '28000.00',
      currency: 'SAR',
      validity_days: 14
    };
    const prop6PdfBuf = await renderProposalPdf({
      proposalId: 'PRP-000006',
      clientName: prop6Content.client_name,
      scope: prop6Content.scope,
      amount: prop6Content.amount,
      currency: prop6Content.currency,
      validityDays: prop6Content.validity_days,
      type: 'commercial'
    });
    const prop6Key = `proposals/${tenantId}/PRP-000006.pdf`;
    await storage.put(prop6Key, prop6PdfBuf, 'application/pdf');

    const token6 = 'demo_proposal_token_alfanar_2026';
    const tokenHash6 = crypto.createHash('sha256').update(token6).digest('hex');

    await client.query(`
      INSERT INTO proposals (
        tenant_id, lead_id, type, status, content_jsonb, pdf_key,
        access_token_hash, access_token_expires_at
      ) VALUES ($1, $2, 'commercial', 'sent', $3, $4, $5, $6);
    `, [tenantId, lead8Id, JSON.stringify(prop6Content), prop6Key, tokenHash6, addDaysIso(14)]);

    // Lead 9: Lost (Manual)
    await client.query(`
      INSERT INTO leads (tenant_id, source, client_name, contact_email, contact_phone, status, assigned_to, notes)
      VALUES ($1, 'manual', 'Eastern Cement Factory', 'procurement@eastern-cement.com.sa', '+966138810009', 'lost', $2, 'Client opted for internal maintenance inspection team.');
    `, [tenantId, salesId]);

    // -------------------------------------------------------------
    // STEP 8: NOTIFICATION LOGS & AUDIT TRAIL
    // -------------------------------------------------------------
    console.log('[Seed] Seeding notification alert logs and audit trail...');

    await client.query(`
      INSERT INTO notification_logs (
        tenant_id, recipient_user_id, recipient_address, channel, template_key, context_jsonb, status, idempotency_key
      ) VALUES 
        ($1, $2, 'admin@demo.local', 'console', 'certificate_expiry_alert', '{"certificateNumber":"CERT-2026-000002","equipmentSerial":"SABIC-TANK-4412","window":"7d"}', 'sent', 'seed:alert:cert2:7d'),
        ($1, $2, 'admin@demo.local', 'console', 'document_expiry_alert', '{"displayName":"ZATCA Tax VAT Registration Certificate","documentType":"VAT_CERTIFICATE","window":"7d"}', 'sent', 'seed:alert:doc_vat:7d'),
        ($1, $2, 'admin@demo.local', 'console', 'document_expiry_alert', '{"displayName":"National Resident ID (IQAMA) - Ahmed","documentType":"IQAMA","window":"expired"}', 'sent', 'seed:alert:ahmed:exp');
    `, [tenantId, adminId]);

    const auditActions = [
      { action: 'lead.create', entityType: 'lead', entityId: lead1Id },
      { action: 'proposal.create', entityType: 'proposal', entityId: prop1Id },
      { action: 'proposal.accept', entityType: 'proposal', entityId: prop1Id },
      { action: 'invoice.paid', entityType: 'invoice', entityId: inv1Id },
      { action: 'work_order.create', entityType: 'work_order', entityId: wo1Id },
      { action: 'work_order.assign', entityType: 'work_order', entityId: wo1Id },
      { action: 'inspection.submit', entityType: 'inspection_submission', entityId: wo1Id },
      { action: 'certificate.issue', entityType: 'certificate', entityId: cert1Id },
      { action: 'work_order.create', entityType: 'work_order', entityId: wo2Id },
      { action: 'certificate.issue', entityType: 'certificate', entityId: cert2Id }
    ];

    for (const a of auditActions) {
      await client.query(`
        INSERT INTO audit_logs (tenant_id, actor_user_id, action, entity_type, entity_id, after_jsonb)
        VALUES ($1, $2, $3, $4, $5, '{"seeded":true}');
      `, [tenantId, adminId, a.action, a.entityType, a.entityId]);
    }

    console.log('[Seed] Database purge and dynamic flow seed completed with 100% success!');
  });
}

// Allow direct CLI execution: node src/db/seed.js
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  seedDatabase()
    .then(() => {
      console.log('[Seed] Process finished.');
      process.exit(0);
    })
    .catch((err) => {
      console.error('[Seed] Seeding failed with error:', err);
      process.exit(1);
    });
}
