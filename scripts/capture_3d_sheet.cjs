const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');

async function main() {
  const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
  console.log('Launching Edge from:', edgePath);

  const browser = await puppeteer.launch({
    executablePath: edgePath,
    headless: true,
    args: ['--no-sandbox', '--disable-gpu', '--window-size=1920,1200']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1200 });

  console.log('Navigating to http://localhost:5173/batting_storyboard_3d.html ...');
  await page.goto('http://localhost:5173/batting_storyboard_3d.html', { waitUntil: 'networkidle0', timeout: 30000 });

  await page.waitForFunction(() => window.isPageReady === true, { timeout: 15000 });
  // Wait a bit for Three.js WebGL frames to render fully
  await new Promise(r => setTimeout(r, 2000));

  console.log('Rendering master sheet canvas...');
  const dataUrl = await page.evaluate(() => {
    return window.renderMasterSheetToDataURL();
  });

  const base64Data = dataUrl.replace(/^data:image\/png;base64,/, '');
  const buffer = Buffer.from(base64Data, 'base64');

  const outPath1 = path.join(__dirname, '..', 'doc', 'images', 'batting_front_11keyframes_3d.png');
  const outPath2 = 'C:\\Users\\nishino\\.gemini\\antigravity\\brain\\131dadf7-122a-43e5-af86-14325e92467b\\batting_front_11keyframes_3d.png';

  fs.mkdirSync(path.dirname(outPath1), { recursive: true });
  fs.writeFileSync(outPath1, buffer);
  fs.writeFileSync(outPath2, buffer);
  console.log('Saved 3D master sheet to:', outPath1, 'and', outPath2);

  // Take a full-page viewer screenshot too
  const viewerShot1 = path.join(__dirname, '..', 'doc', 'images', 'batting_3d_viewer_screenshot.png');
  const viewerShot2 = 'C:\\Users\\nishino\\.gemini\\antigravity\\brain\\131dadf7-122a-43e5-af86-14325e92467b\\batting_3d_viewer_screenshot.png';
  await page.screenshot({ path: viewerShot1, fullPage: true });
  await page.screenshot({ path: viewerShot2, fullPage: true });
  console.log('Saved interactive viewer screenshots to:', viewerShot1);

  await browser.close();
  console.log('Done!');
}

main().catch(err => {
  console.error('Capture error:', err);
  process.exit(1);
});
