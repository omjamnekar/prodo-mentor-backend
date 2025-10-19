const express = require("express");
const router = express.Router();
const Chat = require("../models/Chat");

// Get chat messages for a specific repository
router.get("/:repoId/chat", async (req, res) => {
  const { repoId } = req.params;

  try {
    const messages = await Chat.find({ repositoryId: repoId }).sort({
      timestamp: 1,
    });
    res.status(200).json({ success: true, messages });
  } catch (error) {
    console.error("Error fetching chat messages:", error);
    res
      .status(500)
      .json({ success: false, error: "Failed to fetch chat messages." });
  }
});

// Add a new chat message for a specific repository
router.post("/:repoId/chat", async (req, res) => {
  const { repoId } = req.params;
  const { message, sender } = req.body;

  try {
    const newMessage = new Chat({
      repositoryId: repoId,
      message,
      sender,
      timestamp: new Date(),
    });

    await newMessage.save();
    res.status(201).json({ success: true, message: newMessage });
  } catch (error) {
    console.error("Error saving chat message:", error);
    res
      .status(500)
      .json({ success: false, error: "Failed to save chat message." });
  }
});

module.exports = router;
