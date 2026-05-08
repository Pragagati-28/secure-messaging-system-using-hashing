const mongoose = require("mongoose");

const messageSchema = new mongoose.Schema({

  sender: String,
  senderName: String,

  receiver: String,

  content: String,

  file: String,   // 🔥 IMPORTANT

  hash: String

}, { timestamps: true });

module.exports = mongoose.model("Message", messageSchema);