// scripts/createAdmin.js
import mongoose from 'mongoose';
import bcrypt from 'bcrypt';
import User from '../models/User.js'; // path sahi adjust karna

const MONGO_URI = "mongodb+srv://hariombangali:hariom_9669@room4rent.vwidsux.mongodb.net/room4rent?retryWrites=true&w=majority";

async function createAdmin() {
  await mongoose.connect(MONGO_URI);
  
  const email = "admin@gmail.com";
  const plainPassword = "123";

  // Check if admin already exists
  const existingAdmin = await User.findOne({ email });
  if (existingAdmin) {
    console.log("Admin user already exists!");
    process.exit(0);
  }

  const hashedPassword = await bcrypt.hash(plainPassword, 10);

  const adminUser = new User({
    name: "Admin User",
    email,
    password: hashedPassword,
    role: "admin",
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  await adminUser.save();
  console.log("Admin user created successfully!");
  mongoose.connection.close();
}

createAdmin().catch(err => {
  console.error("Error creating admin:", err);
  mongoose.connection.close();
});
