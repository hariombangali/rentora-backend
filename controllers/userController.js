const bcrypt = require("bcryptjs");
const User = require("../models/User");

function serializeUser(user) {
  return {
    _id: user._id,
    name: user.name,
    email: user.email,
    contact: user.contact || "",
    role: user.role || "user",
    ownerKYC: user.ownerKYC || {},
    ownerVerified: Boolean(user.ownerVerified),
    ownerRejected: Boolean(user.ownerRejected),
    ownerRejectionReason: user.ownerRejectionReason || "",
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

exports.getProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select("-password").lean();
    if (!user) return res.status(404).json({ message: "User not found" });
    res.json({ user: serializeUser(user) });
  } catch (error) {
    console.error("user.getProfile:", error);
    res.status(500).json({ message: "Failed to load profile" });
  }
};

exports.updateProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: "User not found" });

    const {
      name,
      contact,
      ownerName,
      ownerEmail,
      ownerPhone,
      ownerIdType,
      ownerIdNumber,
    } = req.body || {};

    if (name != null) user.name = String(name).trim();
    if (contact != null) user.contact = String(contact).trim();

    if (user.role === "owner") {
      user.ownerKYC = {
        ...(user.ownerKYC || {}),
        ...(ownerName != null ? { ownerName: String(ownerName).trim() } : {}),
        ...(ownerEmail != null ? { ownerEmail: String(ownerEmail).trim() } : {}),
        ...(ownerPhone != null ? { ownerPhone: String(ownerPhone).trim() } : {}),
        ...(ownerIdType != null ? { ownerIdType: String(ownerIdType).trim() } : {}),
        ...(ownerIdNumber != null ? { ownerIdNumber: String(ownerIdNumber).trim() } : {}),
      };
    }

    await user.save();
    res.json({ user: serializeUser(user) });
  } catch (error) {
    console.error("user.updateProfile:", error);
    res.status(500).json({ message: "Failed to update profile" });
  }
};

exports.changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body || {};
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: "Current password and new password are required" });
    }
    if (String(newPassword).length < 6) {
      return res.status(400).json({ message: "New password must be at least 6 characters" });
    }

    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: "User not found" });

    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: "Current password is incorrect" });
    }

    user.password = await bcrypt.hash(newPassword, 10);
    await user.save();

    res.json({ ok: true });
  } catch (error) {
    console.error("user.changePassword:", error);
    res.status(500).json({ message: "Failed to change password" });
  }
};
