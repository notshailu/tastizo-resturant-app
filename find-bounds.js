const sharp = require('sharp');

async function findBounds(input) {
  const { data, info } = await sharp(input).raw().toBuffer({ resolveWithObject: true });
  let minX = info.width, minY = info.height, maxX = 0, maxY = 0;
  
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      const idx = (y * info.width + x) * info.channels;
      const g = data[idx+1];
      
      // If pixel is significantly brighter than the background (e.g. part of white logo)
      // Background G is 137 or 146. Let's say G > 180 is logo.
      if (g > 180) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  
  console.log(input, 'Logo bounds:', { minX, maxX, minY, maxY, width: maxX - minX, height: maxY - minY });
}

findBounds('./assets/images/iconv2.png');
findBounds('./assets/images/icon.png');
