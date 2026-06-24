const sharp = require('sharp');

async function recolor(input, output, oldBg, newBg) {
  try {
    const { data, info } = await sharp(input).raw().toBuffer({ resolveWithObject: true });
    
    // new data array
    const outData = Buffer.alloc(data.length);
    
    for (let i = 0; i < data.length; i += info.channels) {
      const r = data[i];
      const g = data[i+1];
      const b = data[i+2];
      const a = info.channels === 4 ? data[i+3] : 255;
      
      // Calculate 't' based on the G channel which ranges from oldBg.g to 255
      // If G is less than oldBg.g, t is 0.
      let t = (g - oldBg[1]) / (255 - oldBg[1]);
      if (t < 0) t = 0;
      if (t > 1) t = 1;
      
      // If the pixel is not purely grayscale and not close to the interpolation line,
      // it might be some other color, but we assume it's just green and white.
      
      const newR = Math.round(newBg[0] * (1 - t) + 255 * t);
      const newG = Math.round(newBg[1] * (1 - t) + 255 * t);
      const newB = Math.round(newBg[2] * (1 - t) + 255 * t);
      
      outData[i] = newR;
      outData[i+1] = newG;
      outData[i+2] = newB;
      if (info.channels === 4) {
        outData[i+3] = a;
      }
    }
    
    await sharp(outData, {
      raw: {
        width: info.width,
        height: info.height,
        channels: info.channels
      }
    }).toFile(output);
    console.log('Recolored', input, 'to', output);
  } catch (err) {
    console.error('Error recoloring', input, err);
  }
}

async function run() {
  const newBg = [42, 156, 100]; // #2A9C64
  
  // icon.png background is #44926B [68, 146, 107]
  await recolor('./assets/images/icon.png', './assets/images/icon_recolored.png', [68, 146, 107], newBg);
  
  // iconv2.png background is #17895F [23, 137, 95]
  await recolor('./assets/images/iconv2.png', './assets/images/iconv2_recolored.png', [23, 137, 95], newBg);
}

run();
