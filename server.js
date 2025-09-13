import express from "express";
import cors from "cors";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import path from "path";
import { fileURLToPath } from "url";

const app = express();
const PORT = 5000; // or any port
const MONGO_URI = "mongodb+srv://sarveshpateldp7:sarvesh9925@server.8sswtdx.mongodb.net/"; // change if using MongoDB Atlas
const SECRET = "UrbanDealsPlusApp_JWT_SECRET_2025_09_13"; // your own secret key

// ===== Setup paths for serving frontend =====
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ===== Middlewares =====
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public"))); // serve frontend

// ===== MongoDB Connection =====
mongoose
  .connect(MONGO_URI)
  .then(() => console.log("✅ Connected to MongoDB"))
  .catch((err) => console.error("❌ MongoDB error:", err));

// ===== Schemas & Models =====
const userSchema = new mongoose.Schema({
  username: { type: String, unique: true },
  password: String,
});

const folderSchema = new mongoose.Schema({
  name: String,
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  marks: [
    {
      name: String,
      score: Number,
    },
  ],
});

const User = mongoose.model("User", userSchema);
const Folder = mongoose.model("Folder", folderSchema);

// ===== Helpers =====
function generateToken(user) {
  return jwt.sign({ id: user._id, username: user.username }, SECRET, { expiresIn: "1h" });
}

function authMiddleware(req, res, next) {
  const authHeader = req.headers["authorization"];
  if (!authHeader) return res.status(401).json({ message: "Missing Authorization header" });

  const token = authHeader.split(" ")[1];
  jwt.verify(token, SECRET, (err, decoded) => {
    if (err) return res.status(403).json({ message: "Invalid token" });
    req.user = decoded;
    next();
  });
}

// ===== Routes =====

// Root route serves index.html
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Signup
app.post("/signup", async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ message: "All fields required" });

    const existing = await User.findOne({ username });
    if (existing) return res.status(400).json({ message: "User already exists" });

    const hashed = await bcrypt.hash(password, 10);
    const user = new User({ username, password: hashed });
    await user.save();

    const token = generateToken(user);
    res.json({ user: { id: user._id, username: user.username }, token });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Signup error" });
  }
});

// Login
app.post("/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await User.findOne({ username });
    if (!user) return res.status(401).json({ message: "Invalid credentials" });

    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(401).json({ message: "Invalid credentials" });

    const token = generateToken(user);
    res.json({ user: { id: user._id, username: user.username }, token });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Login error" });
  }
});

// Get all folders
app.get("/folders", authMiddleware, async (req, res) => {
  const folders = await Folder.find({ userId: req.user.id });
  res.json({ folders });
});

// Create a new folder
app.post("/folders", authMiddleware, async (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ message: "Folder name required" });

  const folder = new Folder({ name, userId: req.user.id, marks: [] });
  await folder.save();
  res.json(folder);
});

// Get marks for a folder
app.get("/folders/:id/marks", authMiddleware, async (req, res) => {
  const folder = await Folder.findOne({ _id: req.params.id, userId: req.user.id });
  if (!folder) return res.status(404).json({ message: "Folder not found" });
  res.json({ marks: folder.marks });
});

// Add a mark to a folder
app.post("/folders/:id/marks", authMiddleware, async (req, res) => {
  const { name, score } = req.body;
  const folder = await Folder.findOne({ _id: req.params.id, userId: req.user.id });
  if (!folder) return res.status(404).json({ message: "Folder not found" });

  folder.marks.push({ name, score });
  await folder.save();
  res.json(folder);
});

// Overall average
app.get("/stats/average", authMiddleware, async (req, res) => {
  const folders = await Folder.find({ userId: req.user.id });
  let total = 0, count = 0;
  folders.forEach((f) => {
    f.marks.forEach((m) => {
      total += m.score;
      count++;
    });
  });
  const average = count > 0 ? total / count : 0;
  res.json({ average });
});

// ===== Start Server =====
app.listen(PORT, () => console.log(`🚀 Server running on http://localhost:${PORT}`));
