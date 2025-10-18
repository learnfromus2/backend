const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const session = require('express-session');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// MongoDB Connection
mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/mocktestplatform', {
    useNewUrlParser: true,
    useUnifiedTopology: true
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

// Middleware - IMPORTANT: Serve static files from current directory
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(__dirname)); // Serve from current directory

app.use(session({
    secret: process.env.SESSION_SECRET || 'your-secret-key-here',
    resave: false,
    saveUninitialized: false,
    cookie: { 
        secure: false,
        maxAge: 24 * 60 * 60 * 1000
    }
}));

// Authentication Middleware
const requireAuth = (req, res, next) => {
    console.log('Session user:', req.session.user);
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

// Serve index.html for root route
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// API Routes
app.post('/api/register', async (req, res) => {
    try {
        const { username, password, role } = req.body;
        console.log('Register attempt:', username, role);
        
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
        console.log('Login attempt:', username);
        
        const user = await User.findOne({ username });
        
        if (user && await bcrypt.compare(password, user.password)) {
            req.session.user = {
                id: user._id,
                username: user.username,
                role: user.role
            };
            console.log('Login successful:', req.session.user);
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

// Add some sample data for testing
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

        const testCount = await Test.countDocuments();
        if (testCount === 0) {
            const questions = await Question.find().limit(2);
            const sampleTest = new Test({
                title: "Sample JEE Physics Test",
                description: "Basic physics concepts test",
                questions: questions.map(q => q._id),
                duration: 30,
                subject: "Physics",
                createdBy: "system"
            });
            await sampleTest.save();
            console.log('Sample test added');
        }
    } catch (error) {
        console.error('Error adding sample data:', error);
    }
}

// Start server
mongoose.connection.once('open', async () => {
    console.log('✅ Connected to MongoDB');
    
    await initializeAdmin();
    await addSampleData();
    
    app.listen(PORT, () => {
        console.log(`🚀 Server running on http://localhost:${PORT}`);
        console.log(`📚 JEE/NEET Mock Test Platform Ready!`);
    });
});

mongoose.connection.on('error', (err) => {
    console.error('❌ MongoDB connection error:', err);
});

// Handle graceful shutdown
process.on('SIGINT', async () => {
    console.log('\n🛑 Shutting down server...');
    await mongoose.connection.close();
    process.exit(0);
});