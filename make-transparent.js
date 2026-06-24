const sharp = require('sharp');

async function makeTransparent(input, output, oldBg) {
  try {
    const { data, info } = await sharp(input).raw().toBuffer({ resolveWithObject: true });
    
    // Create new buffer with 4 channels (RGBA)
    const outData = Buffer.alloc(info.width * info.height * 4);
    
    for (let i = 0, j = 0; i < data.length; i += info.channels, j += 4) {
      const g = data[i+1];
      
      // Calculate alpha based on the G channel
      let t = (g - oldBg[1]) / (255 - oldBg[1]);
      if (t < 0) t = 0;
      if (t > 1) t = 1;
      
      // We apply an easing to t so that very faint white edge pixels (the halo) become transparent
      // We can just threshold t if we want
      if (t < 0.1) t = 0;
      
      const alpha = Math.round(t * 255);
      
      outData[j] = 255;     // R
      outData[j+1] = 255;   // G
      outData[j+2] = 255;   // B
      outData[j+3] = alpha; // A
    }
    
    await sharp(outData, {
      raw: {
        width: info.width,
        height: info.height,
        channels: 4
      }
    }).toFile(output);
    console.log('Made transparent:', input, '->', output);
  } catch (err) {
    console.error('Error processing', input, err);
  }
}

async function run() {
  // icon.png background is #44926B [68, 146, 107]
  await makeTransparent('./assets/images/icon.png', './assets/images/icon_transparent.png', [68, 146, 107]);
  
  // iconv2.png background is #17895F [23, 137, 95]
  await makeTransparent('./assets/images/iconv2.png', './assets/images/iconv2_transparent.png', [23, 137, 95]);
}

run();
