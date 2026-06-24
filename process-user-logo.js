const sharp = require('sharp');
const fs = require('fs');

async function processImage() {
  const input = 'C:/Users/Shailendra Rajpoot/Desktop/user/Tastizo/assets/images/image.png';
  const output = 'C:/Users/Shailendra Rajpoot/Desktop/user/Tastizo/assets/images/image_transparent.png';
  const outputPadded = 'C:/Users/Shailendra Rajpoot/Desktop/user/Tastizo/assets/images/image_padded_transparent.png';

  const { data, info } = await sharp(input).raw().toBuffer({ resolveWithObject: true });
  const outData = Buffer.alloc(info.width * info.height * 4);

  for (let i = 0, j = 0; i < data.length; i += info.channels, j += 4) {
    const r = data[i];
    const g = data[i+1];
    const b = data[i+2];

    let t = (g - 144) / (255 - 144);
    if (t < 0) t = 0;
    if (t > 1) t = 1;

    if (t < 0.2) t = 0;
    
    const alpha = Math.round(t * 255);

    outData[j] = 255;
    outData[j+1] = 255;
    outData[j+2] = 255;
    outData[j+3] = alpha;
  }

  let minX = info.width, minY = info.height, maxX = 0, maxY = 0;
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      const idx = (y * info.width + x) * 4;
      if (outData[idx+3] > 10) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  const croppedWidth = maxX - minX;
  const croppedHeight = maxY - minY;

  const size = Math.max(croppedWidth, croppedHeight) * 2; // Extra space to be safe for adaptive icon

  const croppedBuffer = await sharp(outData, {
    raw: { width: info.width, height: info.height, channels: 4 }
  })
    .extract({ left: minX, top: minY, width: croppedWidth, height: croppedHeight })
    .toBuffer({ resolveWithObject: true });

  await sharp({
    create: {
      width: Math.round(size),
      height: Math.round(size),
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    }
  })
    .composite([
      {
        input: croppedBuffer.data,
        raw: {
          width: croppedBuffer.info.width,
          height: croppedBuffer.info.height,
          channels: croppedBuffer.info.channels
        },
        gravity: 'center'
      }
    ])
    .toFile(outputPadded);

  console.log('Saved padded image:', outputPadded);
}

processImage();
