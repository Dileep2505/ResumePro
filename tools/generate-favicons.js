const sharp = require('sharp');
const fs = require('fs');
const input = 'frontend/webapp/assets/resumepro-bg.jpeg';
const outDir = 'frontend/webapp/assets';
(async () => {
  try {
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
    // 32x32 PNG
    await sharp(input).resize(32, 32).png().toFile(`${outDir}/favicon-32x32.png`);
    console.log('favicon-32x32.png created');
    // 16x16 PNG for ICO conversion
    const buf16 = await sharp(input).resize(16, 16).png().toBuffer();
    // create ICO using multiple sizes buffer
    // sharp can create .ico by combining pngs but not directly; instead use png-to-ico package would be needed
    // as a fallback write a 16x16 png named favicon-16x16.png
    await sharp(input).resize(16, 16).png().toFile(`${outDir}/favicon-16x16.png`);
    console.log('favicon-16x16.png created');
    console.log('Note: For a .ico file, run a conversion tool (png-to-ico) or use online converter.');
  } catch (err) {
    console.error('Failed to generate favicons', err);
    process.exit(1);
  }
})();
