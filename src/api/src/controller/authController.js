import { register as registerService } from '../services/authService.js';
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
