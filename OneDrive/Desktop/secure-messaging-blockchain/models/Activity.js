const mongoose = require("mongoose");

const activitySchema = new mongoose.Schema({

  user: String,
  action: String,
  time: {
    type: Date,
    default: Date.now
  }

});

module.exports = mongoose.model("Activity", activitySchema);