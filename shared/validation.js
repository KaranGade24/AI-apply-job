import validator from 'validator';

export const validateEmail = (email) => {
  if (!email) return false;
  return validator.isEmail(email);
};

export const validateMobileNumber = (mobileNumber) => {
  if (!mobileNumber) return false;
  // Validates if it's a valid mobile phone number in any locale
  return validator.isMobilePhone(mobileNumber, 'any');
};

export const validatePassword = (password) => {
  if (!password) return false;
  // Validates if the password is strong (min 8 chars, 1 lowercase, 1 uppercase, 1 number, 1 symbol)
  return validator.isStrongPassword(password, {
    minLength: 8,
    minLowercase: 1,
    minUppercase: 1,
    minNumbers: 1,
    minSymbols: 1,
  });
};
