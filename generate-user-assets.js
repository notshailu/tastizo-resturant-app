const sharp = require('sharp');
const fs = require('fs');

async function run() {
  const userInput = 'C:/Users/Shailendra Rajpoot/Desktop/user/Tastizo/assets/images/image.png';
  const userTransparentInput = 'C:/Users/Shailendra Rajpoot/Desktop/user/Tastizo/assets/images/image_transparent.png';
  
  const userPlaystoreIcon = 'C:/Users/Shailendra Rajpoot/Desktop/user/Tastizo/assets/images/playstore_icon.png';
  const userPlaystoreFeature = 'C:/Users/Shailendra Rajpoot/Desktop/user/Tastizo/assets/images/playstore_feature_graphic.png';

  console.log('Generating playstore_icon.png...');
  // Resize image.png to 512x512 for playstore_icon.png
  await sharp(userInput)
    .resize(512, 512)
    .toFile(userPlaystoreIcon);
  console.log('Saved playstore_icon.png!');

  console.log('Generating playstore_feature_graphic.png...');
  // Create 1024x500 feature graphic with #2b9760 background
  // and composite the resized logo in the center
  const logoResized = await sharp(userInput)
    .resize({ height: 350 }) // fit nicely inside 500px height
    .toBuffer();

  await sharp({
    create: {
      width: 1024,
      height: 500,
      channels: 4,
      background: { r: 43, g: 151, b: 96, alpha: 1 } // #2b9760
    }
  })
    .composite([
      {
        input: logoResized,
        gravity: 'center'
      }
    ])
    .toFile(userPlaystoreFeature);
  console.log('Saved playstore_feature_graphic.png!');
}

run().catch(err => {
  console.error(err);
});
