const puppeteer = require('puppeteer');

async function generatePDF(configCode, quoteToken = null, baseUrl) {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 794, height: 1123 });

    let url = `${baseUrl}/pdf-template.html?config=${configCode}`;
    if (quoteToken) url += `&token=${quoteToken}`;

    await page.goto(url, { waitUntil: 'networkidle0', timeout: 30000 });

    // Give images and QR code time to finish rendering
    await new Promise(r => setTimeout(r, 1500));

    const pdfBuffer = await page.pdf({
      width: '794px',
      height: '1123px',
      printBackground: true,
      margin: { top: 0, right: 0, bottom: 0, left: 0 },
    });

    return { success: true, pdfBuffer };
  } finally {
    await browser.close();
  }
}

module.exports = { generatePDF };
