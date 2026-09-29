import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import { Alert } from 'react-native';

/**
 * Generates a beautiful IOCL-branded HTML receipt from the daily entry data.
 * Used by expo-print to create a downloadable PDF.
 */
export const generatePdfHtml = (data) => {
  const {
    staffName = 'Staff',
    machineName = 'Machine',
    petrolNozzleId = 'N1',
    dieselNozzleId = 'N2',
    petrolOpening = '0.0000',
    petrolClosing = '0.0000',
    petrolTesting = 0,
    petrolNetSold = 0,
    petrolRate = 0,
    petrolExpected = 0,
    dieselOpening = '0.0000',
    dieselClosing = '0.0000',
    dieselTesting = 0,
    dieselNetSold = 0,
    dieselRate = 0,
    dieselExpected = 0,
    totalLitersSold = 0,
    totalExpectedAmount = 0,
    cashAmt = 0,
    cashNotesAmt = 0,
    coinsAmt = 0,
    digitalAmt = 0,
    digitalEntries = [],
    udhariAmt = 0,
    udhariBreakdown = [],
    expenseAmt = 0,
    expenseBreakdown = [],
    totalCollection = 0,
    shortageOrExcess = 0,
    udhariReturnTotal = 0,
    udhariReturnEntries = [],
    shiftNumber = 1,
    shiftLabel = '',
    entryDate = new Date()
  } = data;

  const dateStr = new Date(entryDate).toLocaleDateString('hi-IN', {
    year: 'numeric', month: 'long', day: 'numeric', weekday: 'long'
  });
  const timeStr = new Date(entryDate).toLocaleTimeString('hi-IN', {
    hour: '2-digit', minute: '2-digit'
  });
  const isShortage = shortageOrExcess < -0.01;

  // Digital entries HTML rows
  const digitalRowsHtml = digitalEntries
    .filter(e => parseFloat(e.amount) > 0)
    .map(e => `<tr><td style="padding:4px 8px;border-bottom:1px solid #eee;color:#555;">${e.name}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;text-align:right;font-weight:600;">₹${parseFloat(e.amount).toFixed(0)}</td></tr>`)
    .join('');

  // Udhari entries HTML rows
  const udhariRowsHtml = (udhariBreakdown || [])
    .filter(e => (e.name || '').trim() && parseFloat(e.amount) > 0)
    .map(e => `<tr><td style="padding:4px 8px;border-bottom:1px solid #eee;color:#555;">${e.name}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;text-align:right;font-weight:600;">₹${parseFloat(e.amount).toFixed(0)}</td></tr>`)
    .join('');

  // Expense entries HTML rows
  const expenseRowsHtml = (expenseBreakdown || [])
    .filter(e => ((e.reason || '').trim() || e.type === 'salary') && parseFloat(e.amount) > 0)
    .map(e => {
      const label = e.type === 'salary' 
        ? `💼 वेतन / एडवांस (${e.salesmanName || 'Staff'})`
        : (e.reason || 'खर्चा');
      return `<tr><td style="padding:4px 8px;border-bottom:1px solid #eee;color:#555;">${label}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;text-align:right;font-weight:600;">₹${parseFloat(e.amount).toFixed(0)}</td></tr>`;
    })
    .join('');

  // Udhari return entries HTML rows
  const udhariReturnRowsHtml = (udhariReturnEntries || [])
    .filter(e => parseFloat(e.amountReturned) > 0)
    .map(e => `<tr><td style="padding:4px 8px;border-bottom:1px solid #eee;color:#555;">${e.customerName}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;text-align:right;font-weight:600;">₹${parseFloat(e.amountReturned).toFixed(0)}</td></tr>`)
    .join('');

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Helvetica Neue', Arial, sans-serif; background: #fff; color: #1a1a1a; font-size: 13px; }
    .page { max-width: 700px; margin: 0 auto; padding: 20px; }
    
    .header { 
      background: linear-gradient(135deg, #003C8F 0%, #0052CC 100%);
      color: white; 
      padding: 20px 24px; 
      border-radius: 12px; 
      margin-bottom: 16px;
      position: relative;
      overflow: hidden;
    }
    .header::after {
      content: '';
      position: absolute;
      top: -30px; right: -30px;
      width: 120px; height: 120px;
      background: rgba(255,255,255,0.08);
      border-radius: 50%;
    }
    .header-title { font-size: 20px; font-weight: 900; letter-spacing: 0.5px; }
    .header-sub { font-size: 12px; opacity: 0.85; margin-top: 4px; }
    .header-badge { 
      display: inline-block;
      background: rgba(255,111,0,0.9);
      color: white;
      padding: 3px 10px;
      border-radius: 12px;
      font-size: 11px;
      font-weight: 700;
      margin-top: 8px;
    }

    .info-row {
      display: flex;
      justify-content: space-between;
      background: #F8FAFC;
      padding: 12px 16px;
      border-radius: 10px;
      margin-bottom: 12px;
      border: 1px solid #E2E8F0;
    }
    .info-item { text-align: center; }
    .info-label { font-size: 10px; color: #64748B; text-transform: uppercase; font-weight: 700; }
    .info-value { font-size: 14px; font-weight: 800; color: #1E293B; margin-top: 2px; }

    .section { 
      background: #fff; 
      border: 1px solid #E2E8F0; 
      border-radius: 10px; 
      padding: 14px 16px; 
      margin-bottom: 12px; 
    }
    .section-title { 
      font-size: 13px; 
      font-weight: 800; 
      color: #003C8F; 
      margin-bottom: 10px;
      padding-bottom: 6px;
      border-bottom: 2px solid #E2E8F0;
    }

    table { width: 100%; border-collapse: collapse; }
    th { 
      background: #F1F5F9; 
      padding: 6px 8px; 
      text-align: left; 
      font-size: 11px; 
      font-weight: 700; 
      color: #475569;
      border-bottom: 2px solid #CBD5E1;
    }
    th:last-child { text-align: right; }
    td { padding: 5px 8px; border-bottom: 1px solid #F1F5F9; font-size: 12px; }
    td:last-child { text-align: right; }

    .fuel-header { 
      display: flex; 
      align-items: center; 
      margin-bottom: 8px; 
    }
    .fuel-dot { 
      width: 10px; height: 10px; 
      border-radius: 50%; 
      margin-right: 8px; 
    }
    .fuel-name { font-size: 14px; font-weight: 800; }

    .total-row { 
      background: #F0F9FF; 
      padding: 10px 16px; 
      border-radius: 8px; 
      margin-top: 8px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .total-label { font-size: 13px; font-weight: 700; color: #475569; }
    .total-value { font-size: 18px; font-weight: 900; color: #003C8F; }

    .shortage-box {
      padding: 10px 16px;
      border-radius: 8px;
      margin-top: 8px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-weight: 900;
      font-size: 14px;
    }
    .shortage { background: #FEF2F2; color: #DC2626; border: 1px solid #FECACA; }
    .excess { background: #F0FDF4; color: #16A34A; border: 1px solid #BBF7D0; }

    .footer {
      margin-top: 20px;
      padding-top: 12px;
      border-top: 2px dashed #CBD5E1;
      display: flex;
      justify-content: space-between;
      color: #94A3B8;
      font-size: 10px;
    }
    .signature-area {
      margin-top: 30px;
      display: flex;
      justify-content: space-between;
    }
    .sig-box {
      text-align: center;
      width: 200px;
    }
    .sig-line {
      border-top: 1px solid #94A3B8;
      margin-top: 40px;
      padding-top: 4px;
      font-size: 11px;
      color: #64748B;
      font-weight: 600;
    }
  </style>
</head>
<body>
  <div class="page">
    <!-- Header -->
    <div class="header">
      <div class="header-title">⛽ IndianOil Petrol Pump</div>
      <div class="header-sub">दैनिक बिक्री रिपोर्ट (Daily Sales Receipt)</div>
      <span class="header-badge">IOCL Authorized</span>
    </div>

    <!-- Info Row -->
    <div class="info-row">
      <div class="info-item">
        <div class="info-label">दिनांक (Date)</div>
        <div class="info-value">${dateStr}</div>
      </div>
      <div class="info-item">
        <div class="info-label">शिफ्ट (Shift)</div>
        <div class="info-value" style="color:#003C8F;font-weight:bold;">${shiftLabel || ('Shift ' + shiftNumber)}</div>
      </div>
      <div class="info-item">
        <div class="info-label">स्टाफ (Staff)</div>
        <div class="info-value">${staffName}</div>
      </div>
      <div class="info-item">
        <div class="info-label">मशीन (Machine)</div>
        <div class="info-value">${machineName}</div>
      </div>
    </div>

    <!-- Fuel Section -->
    <div class="section">
      <div class="section-title">⛽ ईंधन बिक्री विवरण (Fuel Sales Details)</div>
      
      <!-- Petrol -->
      <div class="fuel-header">
        <div class="fuel-dot" style="background:#FF6F00;"></div>
        <span class="fuel-name" style="color:#FF6F00;">पेट्रोल (${petrolNozzleId} → Tank 1)</span>
      </div>
      <table>
        <tr><th>विवरण</th><th>मान</th></tr>
        <tr><td>ओपनिंग मीटर</td><td><strong>${petrolOpening}</strong></td></tr>
        <tr><td>क्लोजिंग मीटर</td><td><strong>${petrolClosing}</strong></td></tr>
        <tr><td>टेस्टिंग (L)</td><td>${petrolTesting} L (Tank 1 में वापस)</td></tr>
        <tr><td>शुद्ध बिक्री</td><td><strong>${petrolNetSold.toFixed(4)} L</strong></td></tr>
        <tr><td>रेट (₹/L)</td><td>₹${petrolRate}</td></tr>
        <tr style="background:#FFF7ED;"><td style="font-weight:700;">अपेक्षित राशि</td><td style="font-weight:900;color:#FF6F00;">₹${petrolExpected.toFixed(2)}</td></tr>
      </table>

      <div style="height:12px;"></div>

      <!-- Diesel -->
      <div class="fuel-header">
        <div class="fuel-dot" style="background:#0284C7;"></div>
        <span class="fuel-name" style="color:#0284C7;">डीजल (${dieselNozzleId} → Tank 2)</span>
      </div>
      <table>
        <tr><th>विवरण</th><th>मान</th></tr>
        <tr><td>ओपनिंग मीटर</td><td><strong>${dieselOpening}</strong></td></tr>
        <tr><td>क्लोजिंग मीटर</td><td><strong>${dieselClosing}</strong></td></tr>
        <tr><td>टेस्टिंग (L)</td><td>${dieselTesting} L (Tank 2 में वापस)</td></tr>
        <tr><td>शुद्ध बिक्री</td><td><strong>${dieselNetSold.toFixed(4)} L</strong></td></tr>
        <tr><td>रेट (₹/L)</td><td>₹${dieselRate}</td></tr>
        <tr style="background:#F0F9FF;"><td style="font-weight:700;">अपेक्षित राशि</td><td style="font-weight:900;color:#0284C7;">₹${dieselExpected.toFixed(2)}</td></tr>
      </table>

      <div class="total-row">
        <span class="total-label">कुल ईंधन बिक्री: ${totalLitersSold.toFixed(4)} L</span>
        <span class="total-value">₹${totalExpectedAmount.toFixed(2)}</span>
      </div>
    </div>

    <!-- Payment Section -->
    <div class="section">
      <div class="section-title">💰 वसूली विवरण (Payment Collection)</div>
      <table>
        ${coinsAmt > 0 ? `
        <tr><td style="font-weight:600;">💵 कुल कैश (Cash Total)</td><td style="font-weight:700;">₹${cashAmt.toFixed(0)}</td></tr>
        <tr><td style="padding-left:16px;color:#555;">• कैश नोट (Notes)</td><td style="text-align:right;color:#555;">₹${(cashNotesAmt || (cashAmt - coinsAmt)).toFixed(0)}</td></tr>
        <tr><td style="padding-left:16px;color:#555;">• सिक्का / चिल्लर (Coins)</td><td style="text-align:right;color:#555;">₹${coinsAmt.toFixed(0)}</td></tr>
        ` : `
        <tr><td style="font-weight:600;">💵 कैश (Cash)</td><td style="font-weight:700;">₹${cashAmt.toFixed(0)}</td></tr>
        `}
        <tr><td style="font-weight:600;">📱 डिजिटल / कार्ड</td><td style="font-weight:700;">₹${digitalAmt.toFixed(0)}</td></tr>
        ${digitalRowsHtml}
        <tr><td style="font-weight:600;">📒 उधारी (Credit)</td><td style="font-weight:700;">₹${udhariAmt.toFixed(0)}</td></tr>
        ${udhariRowsHtml}
        <tr><td style="font-weight:600;">🧾 खर्चे (Expenses)</td><td style="font-weight:700;">₹${expenseAmt.toFixed(0)}</td></tr>
        ${expenseRowsHtml}
      </table>

      <div class="total-row" style="margin-top:12px;">
        <span class="total-label">कुल वसूली (Total Collection)</span>
        <span class="total-value" style="color:#16A34A;">₹${totalCollection.toFixed(2)}</span>
      </div>

      <div class="shortage-box ${isShortage ? 'shortage' : 'excess'}">
        <span>${isShortage ? '⚠️ कमी (SHORTAGE)' : '✅ अतिरिक्त (EXCESS)'}</span>
        <span>₹${Math.abs(shortageOrExcess).toFixed(2)}</span>
      </div>
    </div>

    ${udhariReturnTotal > 0 ? `
    <!-- Udhari Return Section -->
    <div class="section">
      <div class="section-title">📋 उधारी वापसी (Credit Returns)</div>
      <table>
        <tr><th>ग्राहक</th><th>वापसी राशि</th></tr>
        ${udhariReturnRowsHtml}
      </table>
      <div class="total-row" style="margin-top:8px;">
        <span class="total-label">कुल उधारी वापसी</span>
        <span class="total-value" style="color:#16A34A;">₹${udhariReturnTotal.toFixed(0)}</span>
      </div>
    </div>
    ` : ''}

    <!-- Signature Area -->
    <div class="signature-area">
      <div class="sig-box">
        <div class="sig-line">स्टाफ हस्ताक्षर (Staff)</div>
      </div>
      <div class="sig-box">
        <div class="sig-line">मालिक हस्ताक्षर (Owner)</div>
      </div>
    </div>

    <!-- Footer -->
    <div class="footer">
      <span>Generated: ${new Date().toLocaleString('hi-IN')}</span>
      <span>IOCL Petrol Pump Management System</span>
    </div>
  </div>
</body>
</html>`;
};

/**
 * Generates a PDF from the daily entry data and handles downloading/sharing.
 * Uses expo-print for PDF generation and fallback printing,
 * expo-file-system for copying to scoped app storage (preventing Android/Expo Go permission errors),
 * and expo-sharing for the native share sheet.
 */
export const generateAndSharePdf = async (data) => {
  let html;
  try {
    html = generatePdfHtml(data);
  } catch (htmlErr) {
    console.error('HTML generation error:', htmlErr);
    Alert.alert('PDF त्रुटि', 'PDF रसीद तैयार करने में समस्या आई.');
    return { success: false, error: htmlErr };
  }

  const dateStr = new Date(data.entryDate || new Date()).toISOString().split('T')[0];
  const staffShort = (data.staffName || 'Staff').split(' ')[0].replace(/[^a-zA-Z0-9\u0900-\u097F]/g, '');
  const fileName = `IOCL_${data.machineName || 'Machine'}_${staffShort}_${dateStr}.pdf`;

  try {
    // 1. Generate PDF with base64 so we can write it into the scoped app directory
    const printResult = await Print.printToFileAsync({
      html,
      base64: true,
    });

    let targetUri = printResult.uri;

    // 2. On Android/iOS, write into FileSystem.documentDirectory or cacheDirectory
    // This ensures FilePermissionService allows ExpoSharing to read the file!
    try {
      const baseDir = FileSystem.documentDirectory || FileSystem.cacheDirectory;
      if (baseDir && printResult.base64) {
        const destUri = `${baseDir}${fileName}`;
        await FileSystem.writeAsStringAsync(destUri, printResult.base64, {
          encoding: FileSystem.EncodingType.Base64,
        });
        targetUri = destUri;
      }
    } catch (fsErr) {
      console.warn('FileSystem scoped write note:', fsErr?.message || fsErr);
    }

    // 3. Attempt sharing via native share sheet
    let shareSuccess = false;
    try {
      const isAvailable = await Sharing.isAvailableAsync();
      if (isAvailable && targetUri) {
        await Sharing.shareAsync(targetUri, {
          mimeType: 'application/pdf',
          dialogTitle: `${fileName} — Daily Sales Receipt`,
          UTI: 'com.adobe.pdf',
        });
        shareSuccess = true;
      }
    } catch (shareErr) {
      console.warn('ExpoSharing rejected or dismissed, falling back to system Print/Save as PDF:', shareErr?.message);
      // Fallback: Directly launch native system Print / "Save as PDF" spooler!
      await Print.printAsync({ html });
      shareSuccess = true;
    }

    if (!shareSuccess) {
      // If sharing was unavailable (e.g. tablet or simulator), open native Print dialog directly
      await Print.printAsync({ html });
    }

    return { success: true, uri: targetUri };
  } catch (error) {
    console.error('PDF generation error:', error);
    // Final safety net: launch native Print dialog so user still gets their PDF
    try {
      if (html) {
        await Print.printAsync({ html });
        return { success: true };
      }
    } catch (finalPrintErr) {
      console.error('Final print fallback error:', finalPrintErr);
    }
    Alert.alert('PDF त्रुटि', error.message || 'PDF बनाने में त्रुटि आई.');
    return { success: false, error };
  }
};
