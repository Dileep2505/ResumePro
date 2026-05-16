const sharp = require('sharp');
const fs = require('fs');
const toIco = require('to-ico');
const input = 'frontend/webapp/assets/resumepro.svg';
const outDir = 'frontend/webapp/assets';
(async () => {
  try {
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
    // 32x32 PNG
    const buf32 = await sharp(input).resize(32, 32).png().toBuffer();
    fs.writeFileSync(`${outDir}/favicon-32x32.png`, buf32);
    console.log('favicon-32x32.png created');
    // 16x16 PNG for ICO conversion
    const buf16 = await sharp(input).resize(16, 16).png().toBuffer();
    fs.writeFileSync(`${outDir}/favicon-16x16.png`, buf16);
    console.log('favicon-16x16.png created');
    // create favicon.ico from PNG buffers using to-ico
    const icoUint8 = await toIco([buf16, buf32]);
    fs.writeFileSync(`${outDir}/favicon.ico`, Buffer.from(icoUint8));
    console.log('favicon.ico created');
  } catch (err) {
    console.error('Failed to generate favicons', err);
    process.exit(1);
  }
})();
