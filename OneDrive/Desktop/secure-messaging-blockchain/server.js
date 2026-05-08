const express = require("express");
const mongoose = require("mongoose");
const multer = require("multer");
const app = express();
const path = require("path");
app.use(express.json());     
app.use(express.urlencoded({ extended: true })); 
app.use("/uploads", express.static(require("path").join(__dirname, "uploads")));
const bcrypt = require("bcrypt");
const crypto = require("crypto");
const CryptoJS = require("crypto-js");
const SECRET_KEY = "mySuperSecureKey123";
const Message = require("./models/Message");
const Activity = require("./models/Activity");
const LoginHistory = require("./models/LoginHistory");
const session = require("express-session");
const http = require("http");
const { Server } = require("socket.io");

const server = http.createServer(app);
const io = new Server(server);
const PORT = 3000;
// MongoDB Connection
mongoose.connect("mongodb://127.0.0.1:27017/secureMessagingDB")
.then(() => console.log("MongoDB Connected ✅"))
.catch(err => console.log(err));
const userSchema = new mongoose.Schema({

    name: String,

    email: String,

    password: String,

    otp: String,

    otpExpiry: Date,
   twoFactorEnabled: {
  type: Boolean,
  default: true
},

    loginAttempts: {
      type: Number,
      default: 0
    },

    lockUntil: {
      type: Date,
      default: null
    }

});
const User = mongoose.model("User", userSchema);
app.use(express.static(path.join(__dirname, "public")));

app.get("/login", (req, res) => {
   res.sendFile(path.join(__dirname, "public",  "login.html"));
});


app.use(session({
    secret: "mysecretkey",
    resave: false,
    saveUninitialized: false
}));

app.get("/register", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "register.html"));
});

app.post("/register", async (req, res) => {
    try {
        const hashedPassword = await bcrypt.hash(req.body.password, 10);

        const newUser = new User({
            name: req.body.name,
            email: req.body.email,
            password: hashedPassword
        });

        await newUser.save();

        res.redirect("/login");
    } catch (error) {
        console.log(error);
        res.send("Error Registering User ❌");
    }
});

app.post("/login", async (req, res) => {
    try {
        const user = await User.findOne({ email: req.body.email });
if (user && user.lockUntil && user.lockUntil > Date.now()) {

  return res.send(
    "Account temporarily locked 🔒 Try again later."
  );

}

        if (!user) {
            return res.send("User Not Found ❌");
        }

        const isMatch = await bcrypt.compare(req.body.password, user.password);

        if (isMatch) {
    user.loginAttempts = 0;
user.lockUntil = null;

await user.save();
const otp = Math.floor(
  100000 + Math.random() * 900000
).toString();

user.otp = otp;

user.otpExpiry = Date.now() + 5 * 60 * 1000;

await user.save();

console.log("DEMO OTP:", otp);

    req.session.user = user.email;
    await LoginHistory.create({

  email: user.email,

  ip: req.ip,

  browser: req.headers["user-agent"]

});   

   res.redirect("/verify-otp.html");
} else {

    user.loginAttempts += 1;

    // 3 wrong attempts = lock account
    if (user.loginAttempts >= 3) {

      user.lockUntil = Date.now() + 2 * 60 * 1000;

    }

    await user.save();

    res.send("Invalid Password ❌");

}
    } catch (error) {
        console.log(error);
        res.send("Login Error ❌");
    }
});


app.get("/dashboard", (req, res) => {
  if (!req.session.user) {
    return res.redirect("/login");
  }

 res.sendFile(path.join(__dirname, "public", "dashboard.html"));
});


app.get("/chat", (req, res) => {

  if (!req.session.user) {
    return res.redirect("/login");
  }

  res.sendFile(path.join(__dirname, "public", "chat.html")); 
});
   
app.get("/get-users", async (req, res) => {

  console.log("SESSION USER:", req.session.user); // 🔥 DEBUG

  if (!req.session.user) {
    return res.send([]); // ❌ session नसेल तर empty दे
  }

  const users = await User.find({
    email: { $ne: req.session.user }
  });

  res.json(users);
});
app.get("/get-messages", async (req, res) => {

  const { sender, receiver } = req.query;

  const messages = await Message.find({
    $or: [
      { sender: sender, receiver: receiver },
      { sender: receiver, receiver: sender }
    ]
  }).sort({ createdAt: 1 });

  const decryptedMessages = messages.map(msg => {

  try {

    const bytes = CryptoJS.AES.decrypt(
      msg.content,
      SECRET_KEY
    );

    const decryptedText = bytes.toString(
      CryptoJS.enc.Utf8
    );

    return {
      ...msg._doc,
      content: decryptedText || msg.content
    };

  } catch {

    return msg;

  }

});

res.json(decryptedMessages);
});
app.get("/current-user", (req, res) => {
  res.json({
    email: req.session.user
  });
});
app.post("/send-message", async (req, res) => {

  if (!req.session.user) {
    return res.redirect("/login");
  }

  try {

    console.log("BODY:", req.body);  // 🔥 debug

    const content = req.body.content;
    const receiver = req.body.receiver;
    const encryptedMessage = CryptoJS.AES.encrypt(
  content,
  SECRET_KEY
).toString();

    // ❌ जर data missing असेल
    if (!content || !receiver) {
      return res.send("Content or receiver missing ❌");
    }

    // sender user find कर
    const user = await User.findOne({ email: req.session.user });

    // hash generate
    const hash = require("crypto")
      .createHash("sha256")
      .update(content)
      .digest("hex");

    // message save
    const newMessage = new Message({
      sender: req.session.user,
      senderName: user.name,
      receiver: receiver,
      content: encryptedMessage,
      hash: hash,
  createdAt: new Date()
    });

    await newMessage.save();
console.log("MESSAGE SAVED");
console.log(newMessage);
await Activity.create({
  user: req.session.user,
  action: "Sent Message: " + content
});

    console.log("Message Saved ✅");

    res.send("Message Sent ✅");

  } catch (error) {
    console.log(error);
    res.send("Error ❌");
  }
});
app.get("/settings", (req, res) => {

  if (!req.session.user) {
    return res.redirect("/login");
  }

  res.sendFile(path.join(__dirname, "public", "settings.html"));

});
app.get("/security", (req, res) => {

  if (!req.session.user) {
    return res.redirect("/login");
  }

  res.sendFile(
    path.join(__dirname, "public", "security.html")
  );

});
app.get("/profile", async (req, res) => {
    if (!req.session.user) return res.redirect("/login");

    const user = await User.findOne({ email: req.session.user });

    res.send(`
<!DOCTYPE html>
<html>
<head>
<title>Profile</title>
<link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css" rel="stylesheet">

<style>
.theme-light { background: #f8f9fa; color: #000; }
.theme-dark { background: #121212; color: #fff; }
.theme-green { background: #e6f4ea; color: #000; }
.card-box {
    background: rgba(255,255,255,0.9);
    padding: 25px;
    border-radius: 10px;
}
</style>

</head>

<body>

<script>
const theme = localStorage.getItem("theme") || "light";
document.body.className = "theme-" + theme;
</script>

<div class="container mt-5">
    <div class="card-box shadow">

        <h2>👤 Edit Profile</h2>
        <hr>

        <form action="/update-profile" method="POST">

            <div class="mb-3">
                <label>Name:</label>
                <input type="text" name="name" class="form-control" value="${user.name}" required>
            </div>

            <div class="mb-3">
                <label>Email:</label>
                <input type="email" class="form-control" value="${user.email}" disabled>
            </div>

            <button type="submit" class="btn btn-success">Update Profile</button>
        </form>

        <a href="/dashboard" class="btn btn-secondary mt-3">⬅ Back to Dashboard</a>

    </div>
</div>

</body>
</html>
    `);
});
app.post("/update-profile", async (req, res) => {
    if (!req.session.user) return res.redirect("/login");

    const user = await User.findOne({ email: req.session.user });

    user.name = req.body.name;
    await user.save();

    res.send("Profile updated successfully ✅ <a href='/dashboard'>Back</a>");
});

app.get("/logout", (req, res) => {
    req.session.destroy(() => {
        res.redirect("/login");
    });
});

io.on("connection", (socket) => {
    console.log("User connected");

    socket.on("sendMessage", (data) => {
        io.emit("newMessage", data);
    });

});
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "uploads/");
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + "-" + file.originalname);
  }
});

const upload = multer({ storage });


app.post("/send-file", upload.single("file"), async (req, res) => {

  try {

    if (!req.file) {
      return res.send("No file uploaded ❌");
    }

    const user = await User.findOne({ email: req.session.user });

    const newMessage = new Message({
      sender: req.session.user,
      senderName: user.name,
      receiver: req.body.receiver,
      content: req.file.originalname,
      file: req.file.filename   // 🔥 IMPORTANT
    });

    await newMessage.save();
await Activity.create({
  user: req.session.user,
  action: "Sent File: " + req.file.originalname
});
    console.log("File saved:", req.file.filename);

    res.send("File Sent ✅");

  } catch (err) {
    console.log(err);
    res.send("Error ❌");
  }

});
app.post("/change-password", async (req, res) => {
  if (!req.session.user) return res.redirect("/login");

  const { oldPassword, newPassword } = req.body;
  const user = await User.findOne({ email: req.session.user });

  const match = await bcrypt.compare(oldPassword, user.password);
  if (!match) return res.send("Old password incorrect ❌");

  const hashedPassword = await bcrypt.hash(newPassword, 10);
  user.password = hashedPassword;
  await user.save();

  res.send("Password updated successfully ✅ <a href='/dashboard'>Back</a>");
});
app.get("/files", (req, res) => {
  if (!req.session.user) return res.redirect("/login");

  res.sendFile(path.join(__dirname, "public", "files.html"));
});
app.get("/get-files", async (req, res) => {

  try {

    if (!req.session.user) {
      return res.status(401).json([]);
    }

    const files = await Message.find({

      file: { $ne: null },

      $or: [
        { sender: req.session.user },
        { receiver: req.session.user }
      ]

    }).sort({ createdAt: -1 });

    res.json(files);

  } catch (err) {

    console.log(err);

    res.status(500).json([]);

  }

});
const fs = require("fs");

app.get("/check-files", (req, res) => {
  const files = fs.readdirSync("uploads");
  res.json(files);
});
app.get("/verify", (req, res) => {

  if(!req.session.user){
    return res.redirect("/login");
  }

  res.sendFile(path.join(__dirname, "public", "verify.html"));

});
app.get("/tamper", (req, res) => {

  if(!req.session.user){
    return res.redirect("/login");
  }

  res.sendFile(path.join(__dirname, "public", "tamper.html"));

});
app.post("/log-activity", async (req, res) => {

  try {

    const { user, action } = req.body;

    const newActivity = new Activity({
      user,
      action
    });

    await newActivity.save();

    res.send("Activity logged ✅");

  } catch (err) {
    console.log(err);
    res.status(500).send("Error");
  }

});
app.get("/activity", (req, res) => {

  if (!req.session.user) {
    return res.redirect("/login");
  }

  res.sendFile(path.join(__dirname, "public", "activity.html"));
});
app.get("/get-activity", async (req, res) => {

  try {

    if (!req.session.user) {
      return res.status(401).json([]);
    }

    const logs = await Activity.find().sort({ time: -1 });

    res.json(logs);

  } catch (err) {
    console.log(err);
    res.status(500).json([]);
  }

});
app.get("/login-history", (req, res) => {

  if (!req.session.user) {
    return res.redirect("/login");
  }

  res.sendFile(
    path.join(__dirname, "public", "login-history.html")
  );

});
app.get("/get-login-history", async (req, res) => {

  const logs = await LoginHistory
    .find()
    .sort({ loginTime: -1 });

  res.json(logs);

});
app.get("/get-all-messages", async (req, res) => {

  try {

    if (!req.session.user) {
      return res.status(401).json([]);
    }

    const messages = await Message.find({

      $or: [
        { sender: req.session.user },
        { receiver: req.session.user }
      ]

    }).sort({ createdAt: -1 });

    res.json(messages);

  } catch (err) {

    console.log(err);

    res.status(500).json([]);

  }

});
app.get("/verify-messages", async (req, res) => {

  try {

    const crypto = require("crypto");

    const messages = await Message.find({

      $or: [
        { sender: req.session.user },
        { receiver: req.session.user }
      ]

    });

    const verifiedData = messages.map(msg => {

      let verified = true;

      if (msg.hash) {

        const currentHash = crypto
          .createHash("sha256")
          .update(msg.content)
          .digest("hex");

        verified = currentHash === msg.hash;

      }

      return {
        ...msg._doc,
        verified
      };

    });

    res.json(verifiedData);

  } catch (err) {

    console.log(err);

    res.status(500).json([]);

  }

});
app.post("/verify-otp", async (req, res) => {

  try {

    const user = await User.findOne({ email: req.session.user });

    if (!user) {
      return res.send("User not found ❌");
    }

    const enteredOtp = req.body.otp;

    // OTP expiry check
    if (user.otpExpiry < Date.now()) {
      return res.send("OTP Expired ❌");
    }

    // OTP match check
    if (user.otp === enteredOtp) {

      user.otp = null;
      user.otpExpiry = null;

      await user.save();

      return res.send("Success ✅ OTP Verified");

    } else {
      return res.send("Invalid OTP ❌");
    }

  } catch (err) {
    console.log(err);
    res.send("Error ❌");
  }

});
app.post("/toggle-2fa", async (req, res) => {

  if (!req.session.user) {
    return res.send("Unauthorized ❌");
  }

  try {

    const user = await User.findOne({
      email: req.session.user
    });

    user.twoFactorEnabled =
      !user.twoFactorEnabled;

    await user.save();

    res.json({
      enabled: user.twoFactorEnabled
    });

  } catch (err) {

    console.log(err);

    res.send("Error ❌");
  }

});

server.listen(3000, () => {
console.log("Server running on http://localhost:3000");
});
