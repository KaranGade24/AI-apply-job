import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { validateEmail, validatePassword } from '../../../../shared/validation.js';
import { createUser, findUserByEmail, findUserByUsername, findUserByEmailOrUsername } from '../repositories/userRepository.js';
import { appError } from '../utils/errors.js';
import { logLoginEvent, logRegisterEvent } from '../utils/logger.js';
import { JWT_SECRET } from '../config/env.js';
import { BCRYPT_SALT_ROUNDS, JWT_EXPIRES_IN } from '../constant/api.constant.js';

export const register = async (username, password, email) => {
  try {
    // Validate email
    if (!validateEmail(email)) {
      await logRegisterEvent(email || username, 'FAILED', 'Invalid email format');
      throw new appError('Invalid email format.', 400);
    }

    // Validate password
    if (!validatePassword(password)) {
      await logRegisterEvent(email, 'FAILED', 'Password complexity requirements failed');
      throw new appError('Password does not meet complexity requirements (min 8 chars, 1 uppercase, 1 lowercase, 1 number, 1 symbol).', 400);
    }

    // Verify email uniqueness
    const existingEmail = await findUserByEmail(email);
    if (existingEmail) {
      await logRegisterEvent(email, 'FAILED', 'Email already registered');
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
      await logRegisterEvent(email, 'FAILED', 'Failed to generate unique username');
      throw new appError('Unable to generate a unique username automatically. Please try a different username.', 409);
    }

    // Hash the password using bcrypt
    const passwordHash = await bcrypt.hash(password, BCRYPT_SALT_ROUNDS);

    // Create the user in the database
    const newUser = await createUser({
      email,
      passwordHash,
      username: uniqueUsername
    });

    // Log successful registration
    await logRegisterEvent(newUser.email, 'SUCCESS', `User registered with username: ${newUser.username}`);

    // Create JWT token containing email and username
    const token = jwt.sign(
      { email: newUser.email, username: newUser.username },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
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
    if (!error.isOperational) {
      await logRegisterEvent(email || username, 'FAILED', error.message);
    }
    // If it's already one of our managed app errors, just rethrow it
    if (error.isOperational) {
      throw error;
    }
    // Otherwise, wrap unexpected bugs securely
    throw new appError(`Registration service error: ${error.message}`, 500);
  }
};

export const login = async (identifier, password) => {
  try {
    if (!identifier || !password) {
      throw new appError('Email/Username and password are required.', 400);
    }

    // Find user by email or username
    const user = await findUserByEmailOrUsername(identifier);
    if (!user) {
      await logLoginEvent(identifier, 'FAILED', 'User does not exist');
      throw new appError('Invalid credentials.', 401);
    }

    // Compare hashed password
    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
    if (!isPasswordValid) {
      await logLoginEvent(identifier, 'FAILED', 'Incorrect password');
      throw new appError('Invalid credentials.', 401);
    }

    // Log successful login
    await logLoginEvent(identifier, 'SUCCESS', 'User authenticated successfully');

    // Generate JWT token
    const token = jwt.sign(
      { userId: user._id, email: user.email, username: user.username, role: user.role },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    return {
      user: {
        _id: user._id,
        email: user.email,
        username: user.username,
        role: user.role
      },
      token
    };
  } catch (error) {
    if (error.isOperational) {
      throw error;
    }
    throw new appError(`Login service error: ${error.message}`, 500);
  }
};
