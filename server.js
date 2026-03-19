require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const fs = require('fs');

const connectDB = require('./config/database');
const errorHandler = require('./middleware/errorHandler');
const { startMonthlyReset } = require('./services/subscriptionResetService');

// ── Environment validation ──
const requiredEnvVars = [
  'MONGODB_URI',
  'JWT_SECRET',
  'CLAUDE_API_KEY',
];

const missingVars = requiredEnvVars.filter(v => !process.env[v]);
if (missingVars.length > 0 && process.env.NODE_ENV === 'production') {
  console.error('❌ Missing required environment variables:', missingVars.join(', '));
  process.exit(1);
}

// Import routes
const authRoutes = require('./routes/authRoutes');
const documentRoutes = require('./routes/documentRoutes');
const chatRoutes = require('./routes/chatRoutes');
const flashcardRoutes = require('./routes/flashcardRoutes');
const quizRoutes = require('./routes/quizRoutes');
const mcqRoutes = require('./routes/mcqRoutes');
const subscriptionRoutes = require('./routes/subscriptionRoutes');
const assignmentRoutes = require('./routes/assignmentRoutes');

const app = express();

// Connect to MongoDB
connectDB();

// Start monthly token-reset cron job
startMonthlyReset();

// Middleware
app.use(helmet());
app.use(compression());
app.use(cors({
  origin: process.env.CORS_ORIGIN?.split(',') || '*',
  credentials: true,
}));

// Tiered rate limiting
const makeLimit = (max, windowMs = 15 * 60 * 1000) => rateLimit({
  windowMs,
  max,
  keyGenerator: (req) => req.ip,
  standardHeaders: true,
  legacyHeaders: false,
});

// Auth: tight limit to prevent brute-force / credential stuffing
const authLimiter = makeLimit(20);
// AI routes: moderate limit (token budget already enforced per-user)
const aiLimiter = makeLimit(60);
// General API: comfortable for normal usage
const generalLimiter = makeLimit(200);

// Increase limit to 10mb
app.use(express.json({
  limit: '10mb',
  verify: (req, res, buf) => { req.rawBody = buf; },
}));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Create uploads directory if not exists
if (!fs.existsSync('uploads')) {
  fs.mkdirSync('uploads');
  console.log('📁 Created uploads directory');
}

// API Routes (with tiered rate limits)
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/documents', aiLimiter, documentRoutes);
app.use('/api/chat', aiLimiter, chatRoutes);
app.use('/api/flashcards', aiLimiter, flashcardRoutes);
app.use('/api/quiz', aiLimiter, quizRoutes);
app.use('/api/mcq', aiLimiter, mcqRoutes);
app.use('/api/subscription', generalLimiter, subscriptionRoutes);
app.use('/api/assignments', aiLimiter, assignmentRoutes);

// Health check with DB verification
app.get('/health', async (req, res) => {
  try {
    const { connection } = require('mongoose');
    const isConnected = connection.readyState === 1;
    
    res.status(isConnected ? 200 : 503).json({ 
      status: isConnected ? 'OK' : 'DB_DISCONNECTED',
      database: isConnected ? 'connected' : 'disconnected',
      timestamp: new Date(),
      uptime: process.uptime()
    });
  } catch (error) {
    res.status(503).json({ 
      status: 'ERROR',
      error: error.message,
      timestamp: new Date()
    });
  }
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ message: 'Route not found' });
});

// Error handling middleware
app.use(errorHandler);

const PORT = process.env.PORT || 5000;
const server = app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('📛 SIGTERM received, shutting down gracefully...');
  server.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('📛 SIGINT received, shutting down gracefully...');
  server.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});

module.exports = app;
