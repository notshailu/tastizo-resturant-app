const sharp = require('sharp');

async function processImage(input, output) {
  try {
    const img = sharp(input);
    const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
    
    // Create RGBA buffer making white transparent
    const outData = Buffer.alloc(info.width * info.height * 4);
    for (let i = 0, j = 0; i < data.length; i += info.channels, j += 4) {
      const r = data[i];
      const g = data[i+1];
      const b = data[i+2];
      
      // If color is very close to white, make it transparent
      if (r > 240 && g > 240 && b > 240) {
        outData[j] = 255;
        outData[j+1] = 255;
        outData[j+2] = 255;
        outData[j+3] = 0; // Fully transparent
      } else {
        outData[j] = r;
        outData[j+1] = g;
        outData[j+2] = b;
        outData[j+3] = info.channels === 4 ? data[i+3] : 255;
      }
    }
    
    // Now load the transparent image, trim the transparent edges, and pad to 65% size
    const trimmed = await sharp(outData, {
      raw: { width: info.width, height: info.height, channels: 4 }
    })
    .trim({ background: { r: 0, g: 0, b: 0, alpha: 0 }, threshold: 10 }) // Trim transparent background
    .toBuffer({ resolveWithObject: true });
    
    console.log(`Trimmed ${input} to:`, trimmed.info.width, 'x', trimmed.info.height);
    
    const w = trimmed.info.width;
    const h = trimmed.info.height;
    
    const maxDim = Math.max(w, h);
    
    // We want the logo to take up ~32% of the canvas (zoomed out another 10% roughly).
    // So canvasSize = maxDim / 0.32
    const canvasSize = Math.round(maxDim / 0.32);
    
    await sharp(trimmed.data, {
      raw: { width: w, height: h, channels: 4 }
    })
    .resize(maxDim, maxDim, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .extend({
      top: Math.round((canvasSize - h) / 2),
      bottom: Math.round((canvasSize - h) / 2),
      left: Math.round((canvasSize - w) / 2),
      right: Math.round((canvasSize - w) / 2),
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    })
    .resize(1024, 1024) // Scale to a standard large size so we don't have weird adaptive icon rendering issues
    .toFile(output);
      
    console.log('Successfully processed', input, 'to', output);
  } catch (error) {
    console.error('Error processing', input, error);
  }
}

async function run() {
  await processImage('./assets/images/iconv2.jpeg', './assets/images/iconv2_padded_transparent.png');
  await processImage('./assets/images/icon.png', './assets/images/icon_padded_transparent.png');
}

run();
