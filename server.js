const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const path = require('path');
const cors = require('cors');
const fs = require('fs');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// MongoDB Connection - Use Render's environment variable or MongoDB Atlas
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/mocktestplatform';

mongoose.connect(MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
}).then(() => {
    console.log('✅ Connected to MongoDB');
}).catch(err => {
    console.error('❌ MongoDB connection error:', err);
});

// Schemas
const userSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    role: { type: String, enum: ['student', 'teacher', 'admin'], default: 'student' },
    createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);

const questionSchema = new mongoose.Schema({
    question: String,
    options: [String],
    correctAnswer: Number,
    explanation: String,
    subject: String,
    chapter: String,
    difficulty: String,
    marks: Number,
    createdBy: String,
    createdAt: { type: Date, default: Date.now }
});

const Question = mongoose.model('Question', questionSchema);

const testSchema = new mongoose.Schema({
    title: String,
    description: String,
    questions: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Question' }],
    duration: Number,
    subject: String,
    createdBy: String,
    createdAt: { type: Date, default: Date.now }
});

const Test = mongoose.model('Test', testSchema);

const performanceSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    testId: { type: mongoose.Schema.Types.ObjectId, ref: 'Test' },
    score: Number,
    totalMarks: Number,
    timeTaken: Number,
    answers: [{
        questionId: mongoose.Schema.Types.ObjectId,
        selectedAnswer: Number,
        isCorrect: Boolean
    }],
    createdAt: { type: Date, default: Date.now }
});

const Performance = mongoose.model('Performance', performanceSchema);

// Middleware - CRITICAL for cross-origin requests
app.use(cors({
    origin: function(origin, callback) {
        // Allow requests with no origin (like mobile apps or curl requests)
        if(!origin) return callback(null, true);
        
        const allowedOrigins = [
            'https://front1-jlg7.onrender.com',
            'http://localhost:3000',
            'http://localhost:8080'
        ];
        
        if(allowedOrigins.indexOf(origin) !== -1) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(__dirname));

// Session configuration for production - FIXED VERSION
app.use(session({
    secret: process.env.SESSION_SECRET || 'fallback-secret-key',
    resave: false,
    saveUnitialized: false,
    cookie: { 
        secure: process.env.NODE_ENV === 'production',
        maxAge: 24 * 60 * 60 * 1000,
        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax'
    },
    store: MongoStore.create({
        mongoUrl: MONGODB_URI,
        collectionName: 'sessions'
    })
}));

// Authentication Middleware
const requireAuth = (req, res, next) => {
    if (req.session.user) {
        next();
    } else {
        res.status(401).json({ error: 'Authentication required' });
    }
};

const requireAdmin = (req, res, next) => {
    if (req.session.user && req.session.user.role === 'admin') {
        next();
    } else {
        res.status(403).json({ error: 'Admin access required' });
    }
};

// Routes

// Health check endpoint for Render
app.get('/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV,
        directory: __dirname,
        files: fs.readdirSync(__dirname)
    });
});

// Check if index.html exists
const indexPath = path.join(__dirname, 'index.html');
console.log('Looking for index.html at:', indexPath);

if (fs.existsSync(indexPath)) {
    console.log('✅ index.html found at:', indexPath);
} else {
    console.log('❌ index.html NOT found at:', indexPath);
    console.log('Files in directory:', fs.readdirSync(__dirname));
}

// Serve index.html for all routes (SPA) - with error handling
app.get('*', (req, res) => {
    const indexPath = path.join(__dirname, 'index.html');
    
    if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
    } else {
        // If index.html doesn't exist, send a basic HTML response
        res.send(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>JEE/NEET Mock Test Platform</title>
                <style>
                    body { font-family: Arial, sans-serif; margin: 40px; background: #f0f0f0; }
                    .container { max-width: 800px; margin: 0 auto; background: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
                    h1 { color: #333; }
                    .status { padding: 10px; border-radius: 5px; margin: 10px 0; }
                    .success { background: #d4edda; color: #155724; }
                    .error { background: #f8d7da; color: #721c24; }
                </style>
            </head>
            <body>
                <div class="container">
                    <h1>🚀 JEE/NEET Mock Test Platform</h1>
                    <div class="status error">
                        <strong>Notice:</strong> Frontend files are being loaded...
                    </div>
                    <div class="status success">
                        <strong>Backend Status:</strong> ✅ Server is running correctly
                    </div>
                    <p>The backend API is working. Frontend interface will be available shortly.</p>
                    <p><strong>API Endpoints:</strong></p>
                    <ul>
                        <li><code>POST /api/register</code> - User registration</li>
                        <li><code>POST /api/login</code> - User login</li>
                        <li><code>GET /api/tests</code> - Get available tests</li>
                        <li><code>GET /api/performance</code> - Get user performance</li>
                    </ul>
                    <p><a href="/health">Check server health</a></p>
                </div>
            </body>
            </html>
        `);
    }
});

// API Routes (keep all your existing API routes exactly as they were)
app.post('/api/register', async (req, res) => {
    try {
        const { username, password, role } = req.body;
        
        const hashedPassword = await bcrypt.hash(password, 10);
        
        const user = new User({
            username,
            password: hashedPassword,
            role: role || 'student'
        });
        
        await user.save();
        res.json({ message: 'User registered successfully' });
    } catch (error) {
        console.error('Registration error:', error);
        res.status(400).json({ error: 'Registration failed - username may already exist' });
    }
});

app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        
        const user = await User.findOne({ username });
        
        if (user && await bcrypt.compare(password, user.password)) {
            req.session.user = {
                id: user._id,
                username: user.username,
                role: user.role
            };
            res.json({ message: 'Login successful', user: req.session.user });
        } else {
            res.status(401).json({ error: 'Invalid credentials' });
        }
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Login failed' });
    }
});

app.post('/api/logout', (req, res) => {
    req.session.destroy();
    res.json({ message: 'Logout successful' });
});

app.get('/api/user', (req, res) => {
    res.json({ user: req.session.user || null });
});

// Questions CRUD
app.get('/api/questions', requireAuth, async (req, res) => {
    try {
        const questions = await Question.find();
        res.json(questions);
    } catch (error) {
        console.error('Questions fetch error:', error);
        res.status(500).json({ error: 'Failed to fetch questions' });
    }
});

app.post('/api/questions', requireAuth, async (req, res) => {
    try {
        const question = new Question({
            ...req.body,
            createdBy: req.session.user.username
        });
        await question.save();
        res.json(question);
    } catch (error) {
        console.error('Question creation error:', error);
        res.status(500).json({ error: 'Failed to create question' });
    }
});

// Tests CRUD
app.get('/api/tests', requireAuth, async (req, res) => {
    try {
        const tests = await Test.find().populate('questions');
        res.json(tests);
    } catch (error) {
        console.error('Tests fetch error:', error);
        res.status(500).json({ error: 'Failed to fetch tests' });
    }
});

app.post('/api/tests', requireAuth, async (req, res) => {
    try {
        const test = new Test({
            ...req.body,
            createdBy: req.session.user.username
        });
        await test.save();
        res.json(test);
    } catch (error) {
        console.error('Test creation error:', error);
        res.status(500).json({ error: 'Failed to create test' });
    }
});

// Performance routes
app.post('/api/performance', requireAuth, async (req, res) => {
    try {
        const performance = new Performance({
            ...req.body,
            userId: req.session.user.id
        });
        await performance.save();
        res.json(performance);
    } catch (error) {
        console.error('Performance save error:', error);
        res.status(500).json({ error: 'Failed to save performance' });
    }
});

app.get('/api/performance', requireAuth, async (req, res) => {
    try {
        const performances = await Performance.find({ userId: req.session.user.id })
            .populate('testId');
        res.json(performances);
    } catch (error) {
        console.error('Performance fetch error:', error);
        res.status(500).json({ error: 'Failed to fetch performance' });
    }
});

// AI Guidance
app.get('/api/ai-guidance/:chapter', requireAuth, async (req, res) => {
    const chapter = req.params.chapter;
    const guidance = {
        chapter: chapter,
        topics: [
            `Fundamental concepts in ${chapter}`,
            `Advanced applications of ${chapter}`,
            `Problem-solving strategies for ${chapter}`,
            `Common misconceptions in ${chapter}`
        ],
        recommendation: `Focus on understanding core principles of ${chapter}. Practice derivations and numerical problems regularly. Review previous year questions.`,
        resources: [
            `${chapter} Study Guide`,
            `Practice Questions - ${chapter}`,
            `Video Lectures - ${chapter}`,
            `Revision Notes - ${chapter}`
        ]
    };
    res.json(guidance);
});

// Initialize admin user
async function initializeAdmin() {
    try {
        const adminExists = await User.findOne({ username: process.env.ADMIN_USERNAME });
        if (!adminExists) {
            const hashedPassword = await bcrypt.hash(process.env.ADMIN_PASSWORD, 10);
            const admin = new User({
                username: process.env.ADMIN_USERNAME,
                password: hashedPassword,
                role: 'admin'
            });
            await admin.save();
            console.log('Admin user created successfully');
        } else {
            console.log('Admin user already exists');
        }
    } catch (error) {
        console.error('Error creating admin user:', error);
    }
}

// Add some sample data
async function addSampleData() {
    try {
        const questionCount = await Question.countDocuments();
        if (questionCount === 0) {
            const sampleQuestions = [
                {
                    question: "What is the value of π?",
                    options: ["3.14", "3.41", "4.13", "2.71"],
                    correctAnswer: 0,
                    explanation: "π is approximately 3.14",
                    subject: "Mathematics",
                    chapter: "Trigonometry",
                    difficulty: "easy",
                    marks: 4
                },
                {
                    question: "Which element has atomic number 1?",
                    options: ["Helium", "Hydrogen", "Oxygen", "Carbon"],
                    correctAnswer: 1,
                    explanation: "Hydrogen has atomic number 1",
                    subject: "Chemistry",
                    chapter: "Periodic Table",
                    difficulty: "easy",
                    marks: 4
                }
            ];
            await Question.insertMany(sampleQuestions);
            console.log('Sample questions added');
        }
    } catch (error) {
        console.error('Error adding sample data:', error);
    }
}

// Start server
app.listen(PORT, async () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`📚 JEE/NEET Mock Test Platform Ready!`);
    console.log(`🌐 Environment: ${process.env.NODE_ENV}`);
    console.log(`📁 Current directory: ${__dirname}`);
    console.log(`📄 Files in directory:`, fs.readdirSync(__dirname));
    
    // Initialize data after server starts
    if (mongoose.connection.readyState === 1) {
        await initializeAdmin();
        await addSampleData();
    }
});