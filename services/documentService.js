const cloudinary = require('../config/cloudinary');
const axios = require('axios');
const { PDFParse } = require('pdf-parse');

console.log(`✅ PDFParse (v2) loaded at module init`);



// Upload document to Cloudinary
const uploadToCloudinary = async (filePath, fileName, fileType) => {
  try {
    const resourceType = ['PDF', 'PPTX', 'DOCX'].includes(fileType) ? 'raw' : 'image';

    const result = await cloudinary.uploader.upload(filePath, {
      resource_type: resourceType,
      public_id: `studyai/${Date.now()}_${fileName}`,
      folder: 'studyai/documents',
    });

    return {
      url: result.secure_url,
      publicId: result.public_id,
      fileSize: result.bytes,
    };
  } catch (error) {
    console.error('Cloudinary upload error:', error);
    throw new Error(`Upload failed: ${error.message}`);
  }
};

// Extract text from uploaded document
const extractTextFromDocument = async (cloudinaryUrl, fileType, retries = 3, localFilePath = null) => {
  try {
    console.log(`\n📄 [extractTextFromDocument] Starting extraction...`);
    console.log(`   fileType: ${fileType}`);
    console.log(`   localFilePath: ${localFilePath}`);
    
    if (fileType === 'PDF') {
      const fs = require('fs');
      
      // ALWAYS use local file if available - don't waste time with Cloudinary
      if (!localFilePath || !fs.existsSync(localFilePath)) {
        throw new Error(`Local PDF file not found: ${localFilePath}`);
      }
      
      try {
        console.log(`\n🔄 Reading file from: ${localFilePath}`);
        const fileData = fs.readFileSync(localFilePath);
        console.log(`   ✅ File read: ${fileData.length} bytes`);
        
        console.log(`🔄 Parsing PDF with PDFParse v2...`);
        // Add 5-second timeout to prevent hanging
        const parsePromise = (async () => {
          const parser = new PDFParse({
            verbosity: 0,  // Disable verbose output
            data: fileData  // Pass buffer as data
          });
          return await parser.getText();
        })();
        
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('PDF parsing timeout (5s)')), 5000)
        );
        
        const pdfData = await Promise.race([parsePromise, timeoutPromise]);
        console.log(`   ✅ PDF parse completed`);
        
        // getText() returns {text: string, pages: array}
        const text = pdfData.text || '';
        const numpages = pdfData.pages?.length || 0;
        
        console.log(`   ✅ Extracted text: ${text.length} characters`);
        console.log(`   📄 Pages: ${numpages}`);
        
        if (!text || text.trim().length === 0) {
          console.warn(`⚠️  Warning: PDF has no extractable text`);
          return {
            text: '[PDF contains no text - may be image-based or empty]',
            chunks: [{ chunkId: '1', content: '[Image-based or empty PDF]' }],
          };
        }
        
        // Create chunks
        const chunks = [];
        const chunkSize = 2000;  // Larger chunks for better context
        for (let i = 0; i < text.length; i += chunkSize) {
          chunks.push({
            chunkId: chunks.length.toString(),
            content: text.substring(i, Math.min(i + chunkSize, text.length)),
          });
        }
        
        console.log(`✅ SUCCESS: Extracted ${text.length} chars in ${chunks.length} chunks\n`);
        return { text, chunks };
        
      } catch (parseError) {
        console.error(`❌ PDF parsing error: ${parseError.message}`);
        console.error(`   Stack: ${parseError.stack}`);
        throw parseError;
      }
   } else if (fileType === 'DOCX' || fileType === 'DOC') {
  const mammoth = require('mammoth');
  const fs = require('fs');
  const path = require('path');
  const { execSync } = require('child_process');

  if (!localFilePath || !fs.existsSync(localFilePath)) {
    throw new Error(`Local Word file not found: ${localFilePath}`);
  }

  let text = '';
  
  // First, try with Mammoth (works for DOCX)
  try {
    console.log(`🔄 Extracting text from Word document (${fileType})...`);
    const result = await mammoth.extractRawText({ path: localFilePath });
    text = result.value || '';
    
    if (text && text.trim().length > 0) {
      console.log(`✅ Successfully extracted via Mammoth`);
    }
  } catch (mammothError) {
    console.warn(`⚠️  Mammoth parsing failed: ${mammothError.message}`);
    text = '';
  }

  // If Mammoth failed and it's a .doc file, try antiword directly
  if ((!text || text.trim().length === 0) && (fileType === 'DOC' || localFilePath.endsWith('.doc'))) {
    console.log(`🔄 Detected .doc file - trying antiword extraction...`);
    try {
      // Use antiword directly to extract text from .doc
      const antiwordOutput = execSync(`antiword "${localFilePath}"`, {
        encoding: 'utf-8',
        timeout: 10000,
        stdio: 'pipe'
      });
      
      text = antiwordOutput || '';
      if (text && text.trim().length > 0) {
        console.log(`✅ Successfully extracted via antiword`);
      }
    } catch (antiwordError) {
      console.warn(`⚠️  Antiword extraction failed: ${antiwordError.message}`);
      text = '';
    }
  }

  // If still no text, try textract
  if ((!text || text.trim().length === 0) && (fileType === 'DOC' || localFilePath.endsWith('.doc'))) {
    console.log(`🔄 Attempting textract extraction...`);
    try {
      const textract = require('textract');
      const extractedText = await new Promise((resolve, reject) => {
        textract.fromFileWithPath(localFilePath, (error, result) => {
          if (error) reject(error);
          else resolve(result || '');
        });
      });
      
      text = extractedText;
      if (text && text.trim().length > 0) {
        console.log(`✅ Successfully extracted via textract`);
      }
    } catch (textractError) {
      console.warn(`⚠️  Textract extraction failed: ${textractError.message}`);
    }
  }

  // Check if we got any text
  if (!text || text.trim().length === 0) {
    console.warn(`⚠️  Warning: No text extracted from Word document`);
    return {
      text: `[${fileType} contains no text - may be empty or image-based]`,
      chunks: [{ chunkId: '1', content: `[Empty or image-based ${fileType}]` }],
    };
  }

  // Create chunks from extracted text
  const chunks = [];
  const chunkSize = 2000;
  for (let i = 0; i < text.length; i += chunkSize) {
    chunks.push({
      chunkId: chunks.length.toString(),
      content: text.substring(i, Math.min(i + chunkSize, text.length)),
    });
  }

  console.log(`✅ SUCCESS: Extracted ${text.length} chars from ${fileType} in ${chunks.length} chunks`);
  return { text, chunks };
} else if (fileType === 'PPTX') {
  const fs = require('fs');

  if (!localFilePath || !fs.existsSync(localFilePath)) {
    throw new Error(`Local PPTX file not found: ${localFilePath}`);
  }

  try {
    console.log(`🔄 Extracting text from PowerPoint (adm-zip + XML)...`);
    const AdmZip = require('adm-zip');
    const zip = new AdmZip(localFilePath);

    // Collect slide entries sorted numerically
    const slideEntries = zip.getEntries()
      .filter(e => /^ppt\/slides\/slide\d+\.xml$/.test(e.entryName))
      .sort((a, b) => {
        const na = parseInt(a.entryName.match(/\d+/)[0], 10);
        const nb = parseInt(b.entryName.match(/\d+/)[0], 10);
        return na - nb;
      });

    let text = '';
    slideEntries.forEach((entry, index) => {
      const xml = entry.getData().toString('utf8');
      // Pull all <a:t> text nodes
      const matches = xml.match(/<a:t(?:\s[^>]*)?>([^<]*)<\/a:t>/g) || [];
      const slideText = matches
        .map(m => m.replace(/<[^>]+>/g, '').trim())
        .filter(Boolean)
        .join(' ');
      if (slideText) {
        text += `\n------- Slide ${index + 1} -------\n${slideText}\n`;
      }
    });

    if (!text || text.trim().length === 0) {
      console.warn(`⚠️  Warning: PowerPoint has no extractable text`);
      return {
        text: '[PPTX contains no text]',
        chunks: [{ chunkId: '1', content: '[Empty or image-only presentation]' }],
      };
    }

    const chunks = [];
    const chunkSize = 2000;
    for (let i = 0; i < text.length; i += chunkSize) {
      chunks.push({
        chunkId: chunks.length.toString(),
        content: text.substring(i, Math.min(i + chunkSize, text.length)),
      });
    }

    console.log(`✅ SUCCESS: Extracted ${text.length} chars from PPTX in ${chunks.length} chunks`);
    return { text, chunks };
  } catch (pptxError) {
    console.error(`❌ PPTX parsing error: ${pptxError.message}`);
    throw new Error(`Could not parse PPTX: ${pptxError.message}`);
  }
}

    return {
      text: '[Unknown file type]',
      chunks: [{ chunkId: '1', content: '[Unknown file type]' }],
    };
  } catch (error) {
    console.error(`❌ Extraction failed: ${error.message}`);
    return {
      text: `[Failed to extract: ${error.message}]`,
      chunks: [{ chunkId: '1', content: '[Extraction failed]' }],
    };
  }
};
// Wrapper for multer file buffer (used in assignment controller)
const extractTextFromFile = async (file) => {
  const fs = require('fs');
  const path = require('path');
  const os = require('os');

  const tempPath = path.join(os.tmpdir(), `upload_${Date.now()}_${file.originalname}`);
  fs.writeFileSync(tempPath, file.buffer);

  // Detect file type from BOTH mimetype and file extension
  const fileExtension = path.extname(file.originalname).toLowerCase();
  
  const mimeToType = {
    'application/pdf': 'PDF',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'DOCX',
    'application/msword': 'DOC',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'PPTX',
    'application/vnd.ms-powerpoint': 'PPTX',
  };

  // First try to detect from MIME type, fall back to extension
  let fileType = mimeToType[file.mimetype];
  
  if (!fileType) {
    // Detect from file extension
    const extensionMap = {
      '.pdf': 'PDF',
      '.docx': 'DOCX',
      '.doc': 'DOC',
      '.pptx': 'PPTX',
      '.ppt': 'PPTX',
    };
    fileType = extensionMap[fileExtension] || 'PDF';
    
    if (!fileType) {
      fileType = 'PDF'; // Default fallback
    }
  }

  console.log(`📁 File detected:`);
  console.log(`   Filename: ${file.originalname}`);
  console.log(`   Extension: ${fileExtension}`);
  console.log(`   MIME type: ${file.mimetype}`);
  console.log(`   Detected type: ${fileType}`);

  try {
    const result = await extractTextFromDocument(null, fileType, 3, tempPath);
    fs.unlinkSync(tempPath);
    return { text: result.text, fileName: file.originalname, fileUrl: '', fileType };
  } catch (err) {
    if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
    
    // Improve error message
    let errorMsg = err.message;
    if (fileExtension === '.doc') {
      errorMsg = `❌ ${err.message}\n💡 Legacy .doc files have limited support. Please convert to .docx or PDF for better extraction.`;
    }
    
    const error = new Error(errorMsg);
    throw error;
  }
};
module.exports = {
  uploadToCloudinary,
  extractTextFromDocument,
  extractTextFromFile, // add this
};