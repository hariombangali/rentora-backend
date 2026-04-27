const User = require('../models/User');
const bcrypt = require('bcryptjs');
const generateToken = require('../utils/generateToken');
const { sendOtpEmail } = require('../utils/sendEmail');

// OTP memory store (production me Redis use karte hain)
const otpStore = {};

// @desc Check if user exists by email
exports.checkUserExists = async (req, res) => {
  const { email } = req.query;
  if (!email) return res.status(400).json({ message: 'Email is required' });

  try {
    const user = await User.findOne({ email });
    res.status(200).json({ exists: !!user });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc Register new user
exports.registerUser = async (req, res) => {
  const { name, email, password, contact, role } = req.body;
  if (!name || !email || !password)
    return res.status(400).json({ message: 'All fields are required' });

  try {
    const userExists = await User.findOne({ email });
    if (userExists) return res.status(400).json({ message: 'User already exists' });

    const hashedPwd = await bcrypt.hash(password, 10);
    const accountRole = role === "owner" ? "owner" : "user";
    const user = await User.create({ name, email, password: hashedPwd, contact, role: accountRole });

    return res.status(201).json({
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role || 'user',
      token: generateToken(user._id),
    });
  } catch (err) {
    res.status(500).json({ message: 'Error creating user' });
  }
};

// @desc Login user
exports.loginUser = async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password)
    return res.status(400).json({ message: 'Email and password required' });

  try {
    const user = await User.findOne({ email });
    if (!user) return res.status(401).json({ message: 'Invalid credentials' });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(401).json({ message: 'Invalid credentials' });

    return res.status(200).json({
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role || 'user',
      token: generateToken(user._id),
    });
  } catch (err) {
    res.status(500).json({ message: 'Login failed' });
  }
};

exports.upgradeUserRole = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    user.role = "owner";
    await user.save();

    res.status(200).json({ message: "Role upgraded to owner", role: user.role });
  } catch (error) {
    res.status(500).json({ message: "Something went wrong" });
  }
};


exports.sendOtp = async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ message: "Email is required" });

  try {
    const user = await User.findOne({ email });
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    otpStore[email] = { otp, expiresAt: Date.now() + 10 * 60 * 1000 };

    await sendOtpEmail(email, otp);

    return res.status(200).json({
      success: true,
      message: "OTP sent successfully",
      isNewUser: !user,
    });
  } catch (err) {
    console.error("sendOtp error:", err.message, err.code || "");
    res.status(500).json({ message: "Failed to send OTP. Check email configuration.", detail: err.message });
  }
};


exports.verifyOtp = async (req, res) => {
  const { email, otp } = req.body;
  if (!email || !otp) return res.status(400).json({ message: "Email and OTP required" });

  try {
    const record = otpStore[email];
    if (!record || record.otp !== otp) {
      return res.status(400).json({ message: "Invalid OTP" });
    }
    if (Date.now() > record.expiresAt) {
      delete otpStore[email];
      return res.status(400).json({ message: "OTP has expired. Please request a new one." });
    }

    const user = await User.findOne({ email });

    if (user) {
      delete otpStore[email];
      return res.status(200).json({
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role || "user",
        token: generateToken(user._id),
        newUser: false,
      });
    } else {
      // ✅ new user → ask to set password
      return res.status(200).json({
        otpVerified: true,
        newUser: true,
        email,
      });
    }
  } catch (err) {
    res.status(500).json({ message: "OTP verification failed" });
  }
};


exports.setPassword = async (req, res) => {
  const { email, name, password } = req.body;
  if (!email || !password)
    return res.status(400).json({ message: "Email and password required" });

  try {
    const userExists = await User.findOne({ email });
    if (userExists) return res.status(400).json({ message: "User already exists" });

    const hashedPwd = await bcrypt.hash(password, 10);
    const user = await User.create({
      name: name || email.split("@")[0],
      email,
      password: hashedPwd,
    });

    return res.status(201).json({
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role || "user",
      token: generateToken(user._id),
    });
  } catch (err) {
    res.status(500).json({ message: "Error creating user" });
  }
};
