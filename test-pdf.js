const pdf = require('pdf-parse');

console.log('=== PDF-PARSE INSPECTION ===');
console.log('Type of pdf:', typeof pdf);
console.log('Is function:', typeof pdf === 'function');
console.log('Constructor name:', pdf?.constructor?.name);

const keys = Object.keys(pdf);
console.log('Keys:', keys);

// Try to call it
if (typeof pdf === 'function') {
  console.log('✅ pdf is a function, can call directly');
} else if (typeof pdf === 'object') {
  console.log('❌ pdf is an object, not directly callable');
  
  // Check for callable properties
  for (const key of keys) {
    if (typeof pdf[key] === 'function') {
      console.log(`  - ${key} is a function`);
    }
  }
  
  if (pdf.default && typeof pdf.default === 'function') {
    console.log('✅ pdf.default is a function');
  }
}
