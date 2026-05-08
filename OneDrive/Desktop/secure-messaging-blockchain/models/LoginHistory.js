const mongoose = require("mongoose");

const loginHistorySchema = new mongoose.Schema({

  email: String,

  ip: String,

  browser: String,

  loginTime: {
    type: Date,
    default: Date.now
  }

});

module.exports = mongoose.model("LoginHistory", loginHistorySchema);