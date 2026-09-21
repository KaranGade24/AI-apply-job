import { User } from '../model/User.js';
import { UserProfile } from '../model/UserProfile.js';
import { appError } from '../utils/errors.js';

export const createUser = async ({ email, passwordHash, username }) => {
  try {
    const user = await User.create({ email, passwordHash, username });
    return user;
  } catch (error) {
    throw new appError(`Database error creating user: ${error.message}`, 500);
  }
};

export const findUserById = async (userId) => {
  try {
    return await User.findById(userId);
  } catch (error) {
    throw new appError(`Database error finding user by ID: ${error.message}`, 500);
  }
};

export const findUserProfileByUserId = async (userId) => {
  try {
    return await UserProfile.findOne({ userId });
  } catch (error) {
    throw new appError(`Database error finding user profile: ${error.message}`, 500);
  }
};

export const findUserByEmail = async (email) => {
  try {
    return await User.findOne({ email });
  } catch (error) {
    throw new appError(`Database error finding user by email: ${error.message}`, 500);
  }
};

export const findUserByUsername = async (username) => {
  try {
    return await User.findOne({ username });
  } catch (error) {
    throw new appError(`Database error finding user by username: ${error.message}`, 500);
  }
};

export const findUserByEmailOrUsername = async (identifier) => {
  try {
    return await User.findOne({
      $or: [{ email: identifier }, { username: identifier }]
    });
  } catch (error) {
    throw new appError(`Database error finding user: ${error.message}`, 500);
  }
};

