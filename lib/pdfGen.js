const chromium  = require('@sparticuz/chromium');
const puppeteer = require('puppeteer-core');
const fs        = require('fs');

// Local macOS Chrome paths (fallback for dev — @sparticuz/chromium is Linux-only)
const MAC_CHROME_PATHS = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary',
];

function getLocalChromePath() {
  for (const p of MAC_CHROME_PATHS) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

async function generatePDF(configCode, quoteToken = null, baseUrl) {
  const isLinux = process.platform === 'linux';

  let executablePath, launchArgs, headless, defaultViewport;

  if (isLinux) {
    // Railway / production container — use @sparticuz/chromium
    executablePath  = await chromium.executablePath();
    launchArgs      = chromium.args;
    headless        = chromium.headless;
    defaultViewport = chromium.defaultViewport;
  } else {
    // macOS local dev — find system Chrome
    executablePath = getLocalChromePath();
    if (!executablePath) {
      throw new Error(
        'No Chrome found on macOS. Install Google Chrome or set CHROME_PATH env var.'
      );
    }
    launchArgs      = ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'];
    headless        = true;
    defaultViewport = { width: 794, height: 1123 };
  }

  const browser = await puppeteer.launch({
    args:            launchArgs,
    defaultViewport,
    executablePath,
    headless,
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
      width:           '794px',
      height:          '1123px',
      printBackground: true,
      margin:          { top: 0, right: 0, bottom: 0, left: 0 },
    });

    return { success: true, pdfBuffer };
  } finally {
    await browser.close();
  }
}

module.exports = { generatePDF };
