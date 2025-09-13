const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");

// Create app
const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// ✅ MongoDB connection (replace with your real URI)
mongoose.connect(
  "mongodb+srv://sarveshpateldp7:sarvesh9925@server.8sswtdx.mongodb.net/",
  {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  }
)
.then(() => console.log("✅ MongoDB connected"))
.catch((err) => console.error("❌ Mongo Error:", err));

// ✅ User Schema
const userSchema = new mongoose.Schema({
  username: String,
  password: String, // (later we can hash it with bcrypt)
});

const User = mongoose.model("User", userSchema);

// ✅ Routes

// Test route
app.get("/", (req, res) => {
  res.send("Backend is running 🚀");
});

// Register user
app.post("/register", async (req, res) => {
  try {
    const { username, password } = req.body;

    const newUser = new User({ username, password });
    await newUser.save();

    res.json({ message: "✅ User registered successfully" });
  } catch (err) {
    res.status(500).json({ error: "❌ Something went wrong" });
  }
});

// Get all users (for testing)
app.get("/users", async (req, res) => {
  const users = await User.find();
  res.json(users);
});

// ✅ Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
