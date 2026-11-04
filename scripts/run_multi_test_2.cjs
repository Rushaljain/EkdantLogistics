const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');

(async () => {
  const browser = await puppeteer.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  console.log('Navigating to http://localhost:5173/...');
  await page.goto('http://localhost:5173/', { waitUntil: 'networkidle2' });

  // Clear localStorage for a clean, deterministic state
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle2' });

  const multiTestDir = path.resolve('AG Test/Multi-Test');
  const files = [
    'Kaung Swan-CHW000165B.xlsx',
    'Kaung Swan-CHW000213 (1).xlsx',
    'Kaung Swan-CHW000213A (1).xlsx',
    'Kaung Swan-TAL000172 (1).xlsx',
    'Kaung Swan-TAL000172A (1).xlsx'
  ].map(f => path.join(multiTestDir, f));

  console.log('Selecting file input...');
  const fileInput = await page.$('input[type="file"]');
  if (!fileInput) throw new Error('File input not found');

  console.log('Uploading 5 Multi-Test spreadsheets...');
  await fileInput.uploadFile(...files);

  await new Promise(r => setTimeout(r, 1500));

  // Find Process Invoices button
  const processBtn = await page.evaluateHandle(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    return btns.find(b => b.textContent && b.textContent.includes('Process Invoices'));
  });

  if (!processBtn) throw new Error('Process Invoices button not found');
  console.log('Clicking Process Invoices...');
  await processBtn.click();

  // Wait until processing is finished
  console.log('Waiting for processing to complete...');
  await page.waitForFunction(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const isProcessing = btns.some(b => b.textContent && b.textContent.includes('Processing...'));
    return !isProcessing;
  }, { timeout: 30000 });

  await new Promise(r => setTimeout(r, 2000));

  // Switch to View DG
  console.log('Switching to View DG...');
  await page.evaluate(() => {
    const selects = Array.from(document.querySelectorAll('select'));
    const viewSelect = selects.find(s => Array.from(s.options).some(o => o.value === 'dg'));
    if (viewSelect) {
      viewSelect.value = 'dg';
      viewSelect.dispatchEvent(new Event('change', { bubbles: true }));
    }
  });

  await new Promise(r => setTimeout(r, 2000));

  // Extract the inner HTML of the DG document card
  const dgHtml = await page.evaluate(() => {
    const card = document.querySelector('.max-w-4xl');
    return card ? card.innerHTML : '';
  });

  console.log('Extracted DG HTML length:', dgHtml.length);

  // Switch to View BL
  console.log('Switching to View BL...');
  await page.evaluate(() => {
    const selects = Array.from(document.querySelectorAll('select'));
    const viewSelect = selects.find(s => Array.from(s.options).some(o => o.value === 'bl'));
    if (viewSelect) {
      viewSelect.value = 'bl';
      viewSelect.dispatchEvent(new Event('change', { bubbles: true }));
    }
  });

  await new Promise(r => setTimeout(r, 2000));

  // Extract the inner HTML of the BL document card
  const blHtml = await page.evaluate(() => {
    const card = document.querySelector('.max-w-4xl');
    return card ? card.innerHTML : '';
  });

  console.log('Extracted BL HTML length:', blHtml.length);

  const outDir = path.resolve('AG Test/Multi-Test-Outputs/Test Run 2');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  fs.writeFileSync(path.join(outDir, 'DG_Output.html'), dgHtml, 'utf8');
  fs.writeFileSync(path.join(outDir, 'BL_Output.html'), blHtml, 'utf8');
  console.log('Successfully saved DG_Output.html and BL_Output.html to', outDir);

  await browser.close();
})().catch(err => {
  console.error('Test run failed:', err);
  process.exit(1);
});
