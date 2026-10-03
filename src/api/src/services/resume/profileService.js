/**
 * ProfileService: User profile source of truth, structured preferences, and education/experience history
 */

import * as baseProfileService from '../profile.service.js';

export const getProfile = baseProfileService.getUserProfileService;
export const updateProfile = baseProfileService.updateUserProfileService;

export default {
  getProfile,
  updateProfile,
};
