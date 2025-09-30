import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import mongoose from "mongoose";
import githubRoutes from "./routes/github.js";
import repositoryRoutes from "./routes/repositories.js";
import authRoutes from "./routes/auth.js";
import userRoutes from "./routes/user.js";

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware

// Logging middleware: log all requests to the terminal
app.use((req, res, next) => {
  console.log(`\n[REQUEST] ${res.statusCode} ${req.method} ${req.originalUrl}`);
  if (Object.keys(req.query).length) {
    console.log("  Query:", req.query);
  }
  if (Object.keys(req.params).length) {
    console.log("  Params:", req.params);
  }
  if (req.body && Object.keys(req.body).length) {
    console.log("  Body:", req.body);
  }
  next();
});

app.use(
  cors({
    origin: process.env.CORS_ORIGIN || "http://localhost:3000",
    credentials: true,
  })
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// MongoDB Connection
mongoose
  .connect(
    process.env.MONGODB_URI || "mongodb://localhost:27017/legal-assistant",
    {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    }
  )
  .then(() => {
    console.log("✅ Connected to MongoDB");
  })
  .catch((error) => {
    console.error("❌ MongoDB connection error:", error);
  });

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/github", githubRoutes);
app.use("/api/repositories", repositoryRoutes);
app.use("/api/user", userRoutes);

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({
    status: "OK",
    message: "Legal Assistant Backend is running",
    timestamp: new Date().toISOString(),
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    error: "Something went wrong!",
    message:
      process.env.NODE_ENV === "development"
        ? err.message
        : "Internal Server Error",
  });
});

// 404 handler
app.use("*", (req, res) => {
  res.status(404).json({ error: "Route not found" });
});

app.listen(PORT, () => {
  console.log(`🚀 Server is running on port ${PORT}`);
  console.log(`🌐 Health check: http://localhost:${PORT}/health`);
});
