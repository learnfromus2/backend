import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Fix for __dirname in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();
const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname))); // Serve static files

// MongoDB Atlas Connection
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/jee-neet-platform';
mongoose.connect(MONGODB_URI)
  .then(() => console.log('✅ Connected to MongoDB Atlas'))
  .catch(err => console.log('❌ MongoDB connection error:', err));

// ==================== DATABASE MODELS ====================
const userSchema = new mongoose.Schema({
  username: { type: String, unique: true },
  password: String,
  role: { type: String, default: 'student' },
  createdAt: { type: Date, default: Date.now }
});

const questionSchema = new mongoose.Schema({
  subject: String,
  chapter: String,
  question: String,
  options: [String],
  correctAnswer: Number,
  solution: String,
  difficulty: { type: String, default: 'medium' },
  source: { type: String, default: 'manual' }, // manual, ai, pyq, ncert
  verified: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);
const Question = mongoose.model('Question', questionSchema);

// ==================== AI SERVICE CLASS ====================
class AIService {
  constructor() {
    this.openaiKey = process.env.OPENAI_API_KEY;
  }

  async generateQuestion(topic, difficulty = 'medium', subject = 'Physics') {
    if (!this.openaiKey) {
      return this.getFallbackQuestion(topic, difficulty, subject);
    }

    const prompt = this.createQuestionPrompt(topic, difficulty, subject);
    
    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.openaiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: "gpt-3.5-turbo",
          messages: [{ role: "user", content: prompt }],
          temperature: 0.7
        })
      });

      const data = await response.json();
      return this.parseAIResponse(data.choices[0]?.message?.content);
    } catch (error) {
      console.log('AI API failed, using fallback:', error.message);
      return this.getFallbackQuestion(topic, difficulty, subject);
    }
  }

  createQuestionPrompt(topic, difficulty, subject) {
    return `
    Create a ${difficulty} level JEE/NEET ${subject} question about ${topic}.
    Return ONLY JSON format:
    {
      "question": "question text",
      "options": ["A", "B", "C", "D"],
      "correctAnswer": 0,
      "solution": "step by step solution",
      "difficulty": "${difficulty}",
      "chapter": "${topic}"
    }`;
  }

  parseAIResponse(response) {
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      return jsonMatch ? JSON.parse(jsonMatch[0]) : null;
    } catch (error) {
      return null;
    }
  }

  getFallbackQuestion(topic, difficulty, subject) {
    // Fallback questions if AI fails
    const fallbackQuestions = {
      'Physics': {
        question: `A ${topic} related question?`,
        options: ['Option A', 'Option B', 'Option C', 'Option D'],
        correctAnswer: 0,
        solution: 'Detailed solution will be provided here.',
        difficulty: difficulty,
        chapter: topic
      }
    };
    return fallbackQuestions[subject] || fallbackQuestions['Physics'];
  }
}

const aiService = new AIService();

// ==================== ROUTES ====================

// Serve main page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Authentication
app.post('/api/register', async (req, res) => {
  try {
    const { username, password } = req.body;
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = new User({ username, password: hashedPassword });
    await user.save();
    res.json({ success: true, message: 'User registered' });
  } catch (error) {
    res.json({ success: false, message: 'Username exists' });
  }
});

app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await User.findOne({ username });
    if (user && await bcrypt.compare(password, user.password)) {
      res.json({ success: true, user: { username, role: user.role } });
    } else {
      res.json({ success: false, message: 'Invalid credentials' });
    }
  } catch (error) {
    res.json({ success: false, message: 'Login failed' });
  }
});

// Questions API
app.post('/api/questions', async (req, res) => {
  try {
    const question = new Question(req.body);
    await question.save();
    res.json({ success: true, question });
  } catch (error) {
    res.json({ success: false, message: 'Failed to add question' });
  }
});

app.get('/api/questions', async (req, res) => {
  try {
    const questions = await Question.find();
    res.json(questions);
  } catch (error) {
    res.json([]);
  }
});

// AI Question Generation
app.post('/api/generate-question', async (req, res) => {
  try {
    const { topic, difficulty, subject } = req.body;
    const aiQuestion = await aiService.generateQuestion(topic, difficulty, subject);
    
    if (aiQuestion) {
      aiQuestion.source = 'ai';
      aiQuestion.verified = false;
      res.json({ success: true, question: aiQuestion });
    } else {
      res.json({ success: false, message: 'Failed to generate question' });
    }
  } catch (error) {
    res.status(500).json({ success: false, message: 'AI service error' });
  }
});

// Pre-verified questions from reliable sources
app.get('/api/reliable-questions', async (req, res) => {
  const reliableQuestions = [
    {
      source: 'PYQ',
      subject: 'Physics',
      chapter: 'Electrostatics',
      question: 'Two point charges +4μC and -9μC are placed 2m apart. Where should a third charge be placed for zero net force?',
      options: ['0.8 m from +4μC', '1.2 m from +4μC', '0.8 m from -9μC', '1.2 m from -9μC'],
      correctAnswer: 0,
      solution: 'For equilibrium: 4/x² = 9/(2-x)². Solving gives x=0.8m from +4μC.',
      difficulty: 'medium',
      verified: true
    }
  ];
  res.json({ success: true, questions: reliableQuestions });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📚 JEE/NEET Platform Ready!`);
});