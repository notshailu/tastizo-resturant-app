const sharp = require('sharp');
const fs = require('fs');

async function padImage(input, output) {
  try {
    const metadata = await sharp(input).metadata();
    const w = metadata.width;
    const h = metadata.height;
    
    const maxDim = Math.max(w, h);
    // Increase canvas to make the image 54% of the canvas size (10% zoom out from 60%)
    const newSize = Math.round(maxDim / 0.54);
    
    await sharp(input)
      .resize(maxDim, maxDim, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .extend({
        top: Math.round((newSize - maxDim) / 2),
        bottom: Math.round((newSize - maxDim) / 2),
        left: Math.round((newSize - maxDim) / 2),
        right: Math.round((newSize - maxDim) / 2),
        background: { r: 0, g: 0, b: 0, alpha: 0 }
      })
      .toFile(output);
      
    console.log('Successfully padded', input, 'to', output);
  } catch (error) {
    console.error('Error processing', input, error);
  }
}

async function run() {
  await padImage('./assets/images/iconv2_transparent.png', './assets/images/iconv2_padded_transparent.png');
  await padImage('./assets/images/icon_transparent.png', './assets/images/icon_padded_transparent.png');
}

run();
