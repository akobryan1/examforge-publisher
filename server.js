const express = require('express');
const fs = require('fs').promises;
const path = require('path');

const app = express();
app.set('trust proxy', true);
app.use(express.json({ limit: '50mb' }));
app.use('/exams', express.static(path.join(__dirname, 'public', 'exams')));

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.post('/api/publish', async (req, res) => {
  try {
    const { examId, htmlContent } = req.body;
    if (!examId || !htmlContent) {
      return res.status(400).json({ error: 'Missing examId or htmlContent' });
    }
    
    // Save HTML to public/exams folder
    const publicDir = path.join(__dirname, 'public', 'exams');
    await fs.mkdir(publicDir, { recursive: true });
    await fs.writeFile(path.join(publicDir, `${examId}.html`), htmlContent);
    
    const configuredBaseUrl = process.env.PUBLIC_BASE_URL;
    const protocol = req.headers['x-forwarded-proto'] || req.protocol;
    const host = req.headers['x-forwarded-host'] || req.get('host');
    const baseUrl = configuredBaseUrl || `${protocol}://${host}`;

    res.json({
      success: true,
      examUrl: `${baseUrl}/exams/${examId}.html`,
      examId
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(3000, () => {
  console.log('Publishing server running on port 3000');
});
