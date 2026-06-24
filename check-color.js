const sharp = require('sharp');

async function getColor() {
  try {
    const image = sharp('./assets/images/icon.png');
    // Extract a 1x1 pixel from the top-left corner
    const { data, info } = await image.extract({ left: 0, top: 0, width: 1, height: 1 }).raw().toBuffer({ resolveWithObject: true });
    
    // Output hex color
    const hex = '#' + data[0].toString(16).padStart(2, '0') + 
                      data[1].toString(16).padStart(2, '0') + 
                      data[2].toString(16).padStart(2, '0');
    const alpha = data.length > 3 ? data[3] : 255;
                      
    console.log('Top-left color of icon.png is:', hex.toUpperCase(), 'Alpha:', alpha, 'Channels:', info.channels);
    
    // Also check center pixel
    const metadata = await image.metadata();
    const cx = Math.floor(metadata.width / 2);
    const cy = Math.floor(metadata.height / 2);
    const { data: cData } = await image.extract({ left: cx, top: cy, width: 1, height: 1 }).raw().toBuffer({ resolveWithObject: true });
    
    const chex = '#' + cData[0].toString(16).padStart(2, '0') + 
                       cData[1].toString(16).padStart(2, '0') + 
                       cData[2].toString(16).padStart(2, '0');
    console.log('Center color of icon.png is:', chex.toUpperCase());
    
  } catch(e) {
    console.error(e);
  }
}

getColor();
