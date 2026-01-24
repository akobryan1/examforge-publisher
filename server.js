const express = require('express');
const cors = require('cors');
const fs = require('fs').promises;
const path = require('path');
const admin = require('firebase-admin');

const app = express();
const PORT = process.env.PORT || 10000;

// Initialize Firebase Admin SDK
let firestore;
try {
  const serviceAccount = JSON.parse(process.env.FIREBASE_CREDENTIALS || '{}');
  
  if (serviceAccount.project_id) {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
    firestore = admin.firestore();
    console.log('✅ Firebase Admin initialized successfully');
  } else {
    console.warn('⚠️ Firebase credentials not found. Submissions will only be saved locally.');
  }
} catch (error) {
  console.error('❌ Failed to initialize Firebase Admin:', error.message);
}

app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Health check endpoint
app.get('/health', (req, res) => {
  console.log('Health check received');
  res.json({ 
    status: 'ok', 
    message: 'ExamForge Publishing Server is running',
    timestamp: new Date().toISOString(),
    firestoreConnected: !!firestore
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

// ✅ UPDATED: Handle exam submission and save to Firestore
app.post('/api/submit', async (req, res) => {
  try {
    const { examId, answers, submittedAt, timeSpent, studentEmail, studentName } = req.body;
    
    if (!examId || !answers) {
      console.error('Missing required fields in submission');
      return res.status(400).json({ error: 'Missing examId or answers' });
    }
    
    console.log(`📬 Received submission for exam: ${examId} from ${studentName}`);
    
    // Create a unique submission ID
    const submissionId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    // Prepare submission object
    const submission = {
      submissionId,
      examId,
      studentName,
      studentEmail,
      answers,
      submittedAt,
      timeSpent,
      receivedAt: new Date().toISOString()
    };
    
    // Save to Firestore (primary storage)
    if (firestore) {
      try {
        await firestore.collection('examinee_data').doc(submissionId).set(submission);
        console.log(`✅ Submission saved to Firestore: ${submissionId}`);
      } catch (firestoreError) {
        console.error('❌ Firestore save failed:', firestoreError.message);
        // Continue to save locally as backup
      }
    }
    
    // Also save locally as backup
    const submissionsDir = path.join(__dirname, 'submissions');
    await fs.mkdir(submissionsDir, { recursive: true });
    const filePath = path.join(submissionsDir, `${submissionId}.json`);
    await fs.writeFile(filePath, JSON.stringify(submission, null, 2), 'utf8');
    console.log(`✅ Submission backed up locally: ${submissionId}`);
    
    res.json({ 
      success: true, 
      message: 'Submission received successfully',
      submissionId: submissionId
    });
  } catch (error) {
    console.error('❌ Error saving submission:', error);
    res.status(500).json({ error: 'Failed to save submission' });
  }
});

// Get all submissions for an exam (from Firestore)
app.get('/api/submissions/:examId', async (req, res) => {
  try {
    const { examId } = req.params;
    
    // Try to get from Firestore first
    if (firestore) {
      const snapshot = await firestore.collection('examinee_data')
        .where('examId', '==', examId)
        .get();
      
      const submissions = [];
      snapshot.forEach(doc => {
        submissions.push({ id: doc.id, ...doc.data() });
      });
      
      console.log(`📊 Found ${submissions.length} submissions in Firestore for exam ${examId}`);
      return res.json({ submissions, count: submissions.length, source: 'firestore' });
    }
    
    // Fallback to local files if Firestore not available
    const submissionsDir = path.join(__dirname, 'submissions');
    const files = await fs.readdir(submissionsDir).catch(() => []);
    const submissions = [];
    
    for (const file of files) {
      if (file.endsWith('.json')) {
        const content = await fs.readFile(path.join(submissionsDir, file), 'utf8');
        const submission = JSON.parse(content);
        
        if (submission.examId === examId) {
          submissions.push(submission);
        }
      }
    }
    
    console.log(`📊 Found ${submissions.length} submissions locally for exam ${examId}`);
    res.json({ submissions, count: submissions.length, source: 'local' });
  } catch (error) {
    console.error('❌ Error fetching submissions:', error);
    res.status(500).json({ error: error.message });
  }
});

// List all published exams
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
  console.log(`📬 Submissions directory: ${path.join(__dirname, 'submissions')}`);
  console.log(`🔥 Firestore connected: ${!!firestore}`);
  console.log(`🌐 Environment: ${process.env.NODE_ENV || 'development'}`);
});
