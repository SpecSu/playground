// Offline JPEG candidates only; preserve dimensions and full 4:4:4 chroma.
import sharp from 'sharp';
const [input, prefix] = process.argv.slice(2);
if (!input || !prefix) throw new Error('Expected input image and output prefix.');
for (const quality of [90, 93]) {
  await sharp(input).jpeg({quality, chromaSubsampling:'4:4:4', mozjpeg:true})
    .toFile(`${prefix}-mozjpeg${quality}.jpg`);
}
