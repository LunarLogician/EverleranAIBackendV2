const fs = require('fs');
const { PDFParse } = require('pdf-parse');

// Find a PDF file
const pdfFile = 'uploads/' + fs.readdirSync('uploads').find(f => f.endsWith('.pdf'));
if (!pdfFile || !fs.existsSync(pdfFile)) {
  console.log('No PDF found in uploads');
  process.exit(0);
}

console.log('Testing pdf-parse v2 with:', pdfFile);
const buffer = fs.readFileSync(pdfFile);
console.log('Buffer size:', buffer.length);

async function test() {
  try {
    console.log('\nTrying: new PDFParse().parseBuffer(buffer)');
    const parser = new PDFParse();
    if (typeof parser.parseBuffer === 'function') {
      const result = await parser.parseBuffer(buffer);
      console.log('✅ parseBuffer worked!');
      console.log('Text length:', result.text?.length);
      console.log('Text preview:', result.text?.substring(0, 100));
    } else {
      console.log('parseBuffer not a function');
      console.log('Parser methods:', Object.getOwnPropertyNames(Object.getPrototypeOf(parser)));
    }
  } catch (e) {
    console.log('Error:', e.message);
  }
}

test();
