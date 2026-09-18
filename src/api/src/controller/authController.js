import { register as registerService, login as loginService } from '../services/authService.js';
import { handleError, appError } from '../utils/errors.js';

export const register = async (req, res) => {
  try {
    // Extract values directly from req.body
    const { username, password, email } = req.body;

    if (!username || !password || !email) {
      throw new appError('Username, password, and email are required fields.', 400);
    }

    // Pass the raw parameters directly into auth.service (not req.body)
    const result = await registerService(username, password, email);

    return res.status(201).json({
      message: 'User registered successfully',
      data: result
    });
  } catch (error) {
    // Passes any thrown error to our centralized API error handler
    return handleError(error, res);
  }
};

export const login = async (req, res) => {
  try {
    const { identifier, username, email, password } = req.body;
    const userIdentifier = identifier || username || email;

    if (!userIdentifier || !password) {
      throw new appError('Username/Email and password are required fields.', 400);
    }

    const result = await loginService(userIdentifier, password);

    return res.status(200).json({
      message: 'User logged in successfully',
      data: result
    });
  } catch (error) {
    return handleError(error, res);
  }
};
