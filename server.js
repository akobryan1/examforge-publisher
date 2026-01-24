const express = require('express');
const cors = require('cors');
const fs = require('fs').promises;
const path = require('path');

const app = express();
const PORT = process.env.PORT || 10000;

app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Health check endpoint
app.get('/health', (req, res) => {
  console.log('Health check received');
  res.json({ 
    status: 'ok', 
    message: 'ExamForge Publishing Server is running',
    timestamp: new Date().toISOString()
  });
});

// Serve exam files statically
app.use('/exams', express.static(path.join(__dirname, 'public', 'exams')));

// Publish exam endpoint
app.post('/api/publish', async (req, res) => {
  try {
    const { examId, htmlContent } = req.body;
    
    if (!examId || !htmlContent) {
      console.error('Missing required fields');
      return res.status(400).json({ error: 'Missing examId or htmlContent' });
    }
    
    console.log(`📝 Publishing exam: ${examId}`);
    
    // Create public/exams directory if it doesn't exist
    const publicDir = path.join(__dirname, 'public', 'exams');
    await fs.mkdir(publicDir, { recursive: true });
    
    // Save HTML file
    const filePath = path.join(publicDir, `${examId}.html`);
    await fs.writeFile(filePath, htmlContent, 'utf8');
    
    console.log(`✅ Exam saved to: ${filePath}`);
    
    // Construct public URL
    const baseUrl = process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`;
    const examUrl = `${baseUrl}/exams/${examId}.html`;
    
    console.log(`✅ Exam URL: ${examUrl}`);
    
    res.json({ 
      success: true, 
      examUrl: examUrl,
      examId: examId 
    });
  } catch (error) {
    console.error('❌ Error publishing exam:', error);
    res.status(500).json({ error: error.message });
  }
});

// List all published exams (for debugging)
app.get('/api/exams', async (req, res) => {
  try {
    const publicDir = path.join(__dirname, 'public', 'exams');
    const files = await fs.readdir(publicDir).catch(() => []);
    res.json({ exams: files, count: files.length });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 ExamForge Publishing Server running on port ${PORT}`);
  console.log(`📁 Public directory: ${path.join(__dirname, 'public', 'exams')}`);
  console.log(`🌐 Environment: ${process.env.NODE_ENV || 'development'}`);
});
