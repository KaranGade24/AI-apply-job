import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  passwordHash: { type: String, required: true },
  username: { type: String, required: true, unique: true },
  role: { type: String, enum: ['user', 'admin'], default: 'user' },
  isVerified: { type: Boolean, default: false }
}, {
  timestamps: true // Automatically manages createdAt and updatedAt
});

export const User = mongoose.models.User || mongoose.model('User', userSchema);
