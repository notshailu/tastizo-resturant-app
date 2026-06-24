const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const splashFiles = [
  'android/app/src/main/res/drawable-hdpi/splashscreen_logo.png',
  'android/app/src/main/res/drawable-mdpi/splashscreen_logo.png',
  'android/app/src/main/res/drawable-xhdpi/splashscreen_logo.png',
  'android/app/src/main/res/drawable-xxhdpi/splashscreen_logo.png',
  'android/app/src/main/res/drawable-xxxhdpi/splashscreen_logo.png'
];

async function fixSplash(file) {
  if (!fs.existsSync(file)) return;
  try {
    const { data, info } = await sharp(file).raw().toBuffer({ resolveWithObject: true });
    const outData = Buffer.alloc(info.width * info.height * 4);
    
    // #299861 is RGB [41, 152, 97]
    const bgG = 152;
    
    for (let i = 0, j = 0; i < data.length; i += info.channels, j += 4) {
      const g = data[i+1];
      
      let t = (g - bgG) / (255 - bgG);
      if (t < 0) t = 0;
      if (t > 1) t = 1;
      
      if (t < 0.1) t = 0;
      
      const alpha = Math.round(t * 255);
      
      outData[j] = 255;
      outData[j+1] = 255;
      outData[j+2] = 255;
      outData[j+3] = alpha;
    }
    
    const tmpFile = file.replace('.png', '_tmp.png');
    await sharp(outData, {
      raw: { width: info.width, height: info.height, channels: 4 }
    }).toFile(tmpFile);
    
    fs.renameSync(tmpFile, file);
    console.log('Fixed', file);
  } catch (err) {
    console.error('Error fixing', file, err);
  }
}

async function run() {
  for (const f of splashFiles) {
    await fixSplash(f);
  }
}

run();
