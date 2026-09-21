import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Alert } from 'react-native';
import { PUMP_LOGO_BASE64 } from './pumpLogoBase64';

/**
 * Generates official Annexure S-2 HTML matching the official Tank Lorry retention slip.
 */
export const generateSampleLabelHtml = (data) => {
  const {
    supplyLocation = 'Baitalpur',
    divisionRegion = 'Baitalpur',
    retailOutletName = 'Baijnath',
    retailOutletAddress = '',
    oilCompany = 'IOCL',
    product = 'MS / HSD',
    sourceOfSample = 'Tank Lorry Nozzle / Delivery Hose',
    tankLorryNo = '',
    invoiceNo = '',
    sampleDate = '',
    sampleTime = '',
    challanDensity = '',
    lorryDensity = '',
    roTankNo = '',
    aluminumSealNos = '',
    woodenBoxSealNos = '',
    dealerRepName = 'Baijnath (Dealer / Rep)',
    placeAndDate = 'Baitalpur',
    driverName = '',
    transporterName = '',
    oilCompanyFooter = 'IOCL'
  } = data;

  const fullOutlet = retailOutletAddress 
    ? `${retailOutletName}, ${retailOutletAddress}` 
    : retailOutletName;

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Annexure S-2 Sample Label</title>
  <style>
    @page {
      size: A4 portrait;
      margin: 12mm 16mm;
    }
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
      font-family: 'Helvetica Neue', Arial, sans-serif;
    }
    body {
      background: #ffffff;
      color: #111111;
      font-size: 13px;
      line-height: 1.45;
    }
    .slip-container {
      max-width: 680px;
      margin: 0 auto;
      border: 1.5px solid #111;
      padding: 20px 24px;
      background: #fff;
    }
    .top-annexure {
      text-align: right;
      font-size: 12.5px;
      font-weight: 800;
      letter-spacing: 0.5px;
      text-decoration: underline;
      margin-bottom: 8px;
    }
    .header-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 12px;
      padding-bottom: 8px;
      border-bottom: 1.5px solid #111;
    }
    .logo-cell {
      width: 90px;
      text-align: center;
      vertical-align: middle;
    }
    .logo-img {
      width: 60px;
      height: 60px;
      object-fit: contain;
    }
    .logo-caption {
      font-size: 9.5px;
      font-weight: 800;
      color: #003C8F;
      margin-top: 2px;
    }
    .title-cell {
      text-align: center;
      vertical-align: middle;
      padding: 0 10px;
    }
    .main-title {
      font-size: 13.5px;
      font-weight: 900;
      letter-spacing: 0.6px;
      text-transform: uppercase;
      line-height: 1.35;
    }
    .sub-title {
      font-size: 12px;
      font-weight: 800;
      letter-spacing: 0.4px;
      text-transform: uppercase;
      margin-top: 4px;
    }

    .meta-row {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      margin: 12px 0 14px 0;
      font-size: 12.5px;
      font-weight: 700;
    }
    .meta-group {
      display: flex;
      align-items: baseline;
    }
    .meta-label {
      white-space: nowrap;
      margin-right: 4px;
    }
    .dotted-fill {
      border-bottom: 1px dotted #000;
      padding: 0 6px;
      min-width: 150px;
      font-weight: 800;
      color: #003C8F;
    }

    .form-block {
      margin-bottom: 12px;
    }
    .field-row {
      display: flex;
      align-items: baseline;
      margin-bottom: 7px;
      font-size: 12.5px;
    }
    .field-num {
      width: 22px;
      font-weight: 800;
      flex-shrink: 0;
    }
    .field-label {
      font-weight: 700;
      flex-shrink: 0;
      margin-right: 6px;
    }
    .field-dots {
      flex: 1;
      border-bottom: 1px dotted #000;
      padding-left: 6px;
      font-weight: 800;
      color: #000;
      min-height: 18px;
    }
    .split-field-row {
      display: flex;
      align-items: baseline;
      margin-bottom: 7px;
      font-size: 12.5px;
    }
    .split-half {
      display: flex;
      align-items: baseline;
      flex: 1;
    }

    .cert-box {
      margin: 12px 0;
      padding: 8px 10px;
      border: 1px solid #333;
      background: #fafafa;
      font-size: 11.5px;
      line-height: 1.4;
      text-align: justify;
      font-style: italic;
    }

    .sig-table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 10px;
      font-size: 12px;
    }
    .sig-table td {
      padding: 4px 2px;
      vertical-align: bottom;
    }
    .sig-lbl {
      font-weight: 700;
      width: 52%;
    }
    .sig-dot {
      border-bottom: 1px dotted #000;
      width: 48%;
      font-weight: 800;
      color: #000;
      min-height: 18px;
      padding-left: 4px;
    }
    .badge-tag {
      background: #003C8F;
      color: #fff;
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 11px;
      font-weight: 800;
      display: inline-block;
    }
  </style>
</head>
<body>
  <div class="slip-container">
    <!-- Top Reference -->
    <div class="top-annexure">ANNEXURE - S-2</div>

    <!-- Official Header with IndianOil Logo -->
    <table class="header-table">
      <tr>
        <td class="logo-cell">
          <img src="${PUMP_LOGO_BASE64}" class="logo-img" alt="IOCL" />
          <div class="logo-caption">IndianOil</div>
        </td>
        <td class="title-cell">
          <div class="main-title">SAMPLE LABEL - TANK LORRY RETENTION SAMPLE</div>
          <div class="sub-title">DRAWN AT RETAIL OUTLETS</div>
        </td>
      </tr>
    </table>

    <!-- Supply Location & Division Row -->
    <div class="meta-row">
      <div class="meta-group" style="flex: 1;">
        <span class="meta-label">SUPPLY LOCATION :</span>
        <span class="dotted-fill" style="flex: 1;">${supplyLocation || 'Baitalpur'}</span>
      </div>
      <div class="meta-group" style="flex: 1; margin-left: 14px;">
        <span class="meta-label">DIVISION/TERRITORY/REGION:</span>
        <span class="dotted-fill" style="flex: 1;">${divisionRegion || 'Baitalpur'}</span>
      </div>
    </div>

    <!-- Numbered Checklist Form -->
    <div class="form-block">
      <!-- 1 -->
      <div class="field-row">
        <span class="field-num">1.</span>
        <span class="field-label">Name & address of the Retail Outlet :</span>
        <span class="field-dots">${fullOutlet || 'Baijnath'}</span>
      </div>

      <!-- 2 -->
      <div class="field-row">
        <span class="field-num">2.</span>
        <span class="field-label">Name of the Oil Company :</span>
        <span class="field-dots">${oilCompany || 'IOCL'}</span>
      </div>

      <!-- 3 -->
      <div class="field-row">
        <span class="field-num">3.</span>
        <span class="field-label">Product :</span>
        <span class="field-dots">
          ${product ? `<span class="badge-tag">${product}</span>` : 'MS / HSD'}
        </span>
      </div>

      <!-- 4 -->
      <div class="field-row">
        <span class="field-num">4.</span>
        <span class="field-label">Source of sample :</span>
        <span class="field-dots">${sourceOfSample || 'Tank Lorry Nozzle / Delivery Hose'}</span>
      </div>

      <!-- 5 -->
      <div class="split-field-row">
        <div class="split-half" style="margin-right: 12px;">
          <span class="field-num">5.</span>
          <span class="field-label">Tank Lorry No. :</span>
          <span class="field-dots">${tankLorryNo || ''}</span>
        </div>
        <div class="split-half">
          <span class="field-label">Invoice No. :</span>
          <span class="field-dots">${invoiceNo || ''}</span>
        </div>
      </div>

      <!-- 6 -->
      <div class="split-field-row">
        <div class="split-half" style="margin-right: 12px;">
          <span class="field-num">6.</span>
          <span class="field-label">Samples drawn on :</span>
          <span class="field-dots">${sampleDate || ''}</span>
        </div>
        <div class="split-half">
          <span class="field-label">at :</span>
          <span class="field-dots">${sampleTime ? `${sampleTime} hours` : ''}</span>
        </div>
      </div>

      <!-- 7 -->
      <div class="field-row" style="margin-bottom: 3px;">
        <span class="field-num">7.</span>
        <span class="field-label">Density at 15 Deg C</span>
      </div>
      <div class="field-row" style="padding-left: 22px;">
        <span class="field-label" style="font-weight: 600;">a) as recorded in the Challan :</span>
        <span class="field-dots">${challanDensity ? `${challanDensity} kg/m³` : ''}</span>
      </div>
      <div class="field-row" style="padding-left: 22px;">
        <span class="field-label" style="font-weight: 600;">b) of sample collected from the lorry :</span>
        <span class="field-dots">${lorryDensity ? `${lorryDensity} kg/m³` : ''}</span>
      </div>

      <!-- 8 -->
      <div class="field-row">
        <span class="field-num">8.</span>
        <span class="field-label">RO Tank No. of Product decanted :</span>
        <span class="field-dots">${roTankNo || ''}</span>
      </div>

      <!-- 9 -->
      <div class="field-row">
        <span class="field-num">9.</span>
        <span class="field-label">Plastic Seals Nos. of Aluminum container :</span>
        <span class="field-dots">${aluminumSealNos || ''}</span>
      </div>

      <!-- 10 -->
      <div class="field-row">
        <span class="field-num">10.</span>
        <span class="field-label">Plastic Seals Nos. of wooden box :</span>
        <span class="field-dots">${woodenBoxSealNos || ''}</span>
      </div>
    </div>

    <!-- Mandatory Certification -->
    <div class="cert-box">
      Certified that empty containers had been rinsed with the products before drawing of samples in my presence and the sample is retained after proper labeling and sealing.
    </div>

    <!-- Signatures & Authority Section -->
    <table class="sig-table">
      <tr>
        <td class="sig-lbl">Signature of the Dealer/Dealer's representative :</td>
        <td class="sig-dot"></td>
      </tr>
      <tr>
        <td class="sig-lbl">Name of the Dealer/Dealer's representative :</td>
        <td class="sig-dot">${dealerRepName || 'Baijnath'}</td>
      </tr>
      <tr>
        <td class="sig-lbl">Seal / rubber Stamp :</td>
        <td class="sig-dot"></td>
      </tr>
      <tr>
        <td class="sig-lbl">Place and Date :</td>
        <td class="sig-dot">${placeAndDate || 'Baitalpur'}</td>
      </tr>
      <tr>
        <td class="sig-lbl">Signature of T/L driver :</td>
        <td class="sig-dot"></td>
      </tr>
      <tr>
        <td class="sig-lbl">Name of T/L driver :</td>
        <td class="sig-dot">${driverName || ''}</td>
      </tr>
      <tr>
        <td class="sig-lbl">Transporter's name :</td>
        <td class="sig-dot">${transporterName || ''}</td>
      </tr>
      <tr>
        <td class="sig-lbl">Oil Company :</td>
        <td class="sig-dot">${oilCompanyFooter || 'IOCL'}</td>
      </tr>
    </table>
  </div>
</body>
</html>`;
};

/**
 * Creates and prints / shares the PDF
 */
export const generateAndShareSampleLabelPdf = async (data) => {
  let html = '';
  try {
    html = generateSampleLabelHtml(data);
    const invoiceSlug = (data.invoiceNo || 'sample').replace(/[^a-zA-Z0-9]/g, '_');
    const fileName = `Sample_Label_${data.product || 'MS_HSD'}_${invoiceSlug}_${Date.now()}`;

    // 1. Generate PDF file via expo-print
    const { uri: tempUri } = await Print.printToFileAsync({
      html,
      base64: false
    });

    // 2. Share PDF
    let shareSuccess = false;
    try {
      const isAvailable = await Sharing.isAvailableAsync();
      if (isAvailable && tempUri) {
        await Sharing.shareAsync(tempUri, {
          mimeType: 'application/pdf',
          dialogTitle: `${fileName} — Retention Sample Label`,
          UTI: 'com.adobe.pdf',
        });
        shareSuccess = true;
      }
    } catch (shareErr) {
      console.warn('ExpoSharing fallback to Print:', shareErr?.message);
      await Print.printAsync({ html });
      shareSuccess = true;
    }

    if (!shareSuccess) {
      await Print.printAsync({ html });
    }

    return { success: true, uri: tempUri };
  } catch (error) {
    console.error('Sample Label PDF generation error:', error);
    try {
      if (html) {
        await Print.printAsync({ html });
        return { success: true };
      }
    } catch (printErr) {
      console.error('Final print error:', printErr);
    }
    Alert.alert('PDF Error', error.message || 'Failed to generate Sample Label PDF.');
    return { success: false, error };
  }
};
