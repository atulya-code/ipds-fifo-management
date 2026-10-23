
require("dotenv").config();
const mongoose = require("mongoose");
const bcrypt = require("bcrypt");
const User = require("./models/User");

async function main() {
  await mongoose.connect(process.env.MONGO_URI);

  const email = "approver@test.com";

  const existing = await User.findOne({ email });

  if (existing) {
    console.log("Account already exists:", {
      email: existing.email,
      role: existing.role,
    });
    return;
  }

  const password = "ApproverTest123!";
  const hashedPassword = await bcrypt.hash(password, 12);

  const user = await User.create({
    name: "Test Approver",
    email,
    password: hashedPassword,
    role: "approver",
    assignedGodown: new mongoose.Types.ObjectId(
      "6ada4eee8f50f978c7cebea4"
    ),
  });

  console.log("Test approver created successfully!");
  console.log("Email:", user.email);
  console.log("Role:", user.role);
  console.log("Temporary password:", password);
}

main()
  .catch((error) => {
    console.error("Error:", error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
