import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { validateEmail, validatePassword } from '../../../../shared/validation.js';
import { createUser, findUserByEmail, findUserByUsername } from '../repositories/userRepository.js';
import { appError } from '../utils/errors.js';

export const register = async (username, password, email) => {
  try {
    // Validate email
    if (!validateEmail(email)) {
      throw new appError('Invalid email format.', 400);
    }

    // Validate password
    if (!validatePassword(password)) {
      throw new appError('Password does not meet complexity requirements (min 8 chars, 1 uppercase, 1 lowercase, 1 number, 1 symbol).', 400);
    }

    // Verify email uniqueness
    const existingEmail = await findUserByEmail(email);
    if (existingEmail) {
      throw new appError('Email is already registered.', 409);
    }

    // Assign random number if username exists to ensure it is absolutely unique
    let uniqueUsername = username;
    let isUnique = false;
    let attempts = 0;
    const MAX_ATTEMPTS = 5;
    
    while (!isUnique && attempts < MAX_ATTEMPTS) {
      const existingUser = await findUserByUsername(uniqueUsername);
      if (existingUser) {
        // Append a random 4-digit number at the end of the username
        const randomSuffix = Math.floor(Math.random() * 10000);
        uniqueUsername = `${username}${randomSuffix}`;
        attempts++;
      } else {
        isUnique = true;
      }
    }

    // If we exceed our max attempts, exit the loop securely
    if (!isUnique) {
      throw new appError('Unable to generate a unique username automatically. Please try a different username.', 409);
    }

    // Hash the password using bcrypt
    const passwordHash = await bcrypt.hash(password, 10);

    // Create the user in the database
    const newUser = await createUser({
      email,
      passwordHash,
      username: uniqueUsername
    });

    // Create JWT token containing email and username
    const token = jwt.sign(
      { email: newUser.email, username: newUser.username },
      process.env.JWT_SECRET || 'default_fallback_secret',
      { expiresIn: '24h' }
    );

    return {
      user: {
        _id: newUser._id,
        email: newUser.email,
        username: newUser.username,
        role: newUser.role
      },
      token
    };
  } catch (error) {
    // If it's already one of our managed app errors, just rethrow it
    if (error.isOperational) {
      throw error;
    }
    // Otherwise, wrap unexpected bugs securely
    throw new appError(`Registration service error: ${error.message}`, 500);
  }
};
