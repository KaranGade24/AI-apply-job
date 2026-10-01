/**
 * Redacts a sensitive value (such as credentials, field values, tokens, etc.)
 * by masking it with asterisks or returning a safe representation.
 * @param {any} value - The value to mask
 * @returns {string} The masked/redacted string
 */
export const maskValue = (value) => {
  if (value === null || value === undefined) {
    return '';
  }
  const str = String(value);
  if (str.length === 0) {
    return '';
  }
  if (str.length <= 4) {
    return '*'.repeat(str.length);
  }
  // Keep first and last character, mask the middle
  return str[0] + '*'.repeat(str.length - 2) + str[str.length - 1];
};

export default maskValue;
