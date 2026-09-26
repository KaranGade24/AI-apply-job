import { naukriConfig } from './naukriConfig.js';

/**
 * Utility for human-like randomized delays and rate limiting
 */
export const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export const randomDelay = async (
  minMs = naukriConfig.rateLimit?.minDelayMs || 1500,
  maxMs = naukriConfig.rateLimit?.maxDelayMs || 3500
) => {
  const waitMs = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
  await delay(waitMs);
};

export class NaukriRateLimiter {
  constructor(options = {}) {
    this.minDelayMs = options.minDelayMs || 2000;
    this.maxDelayMs = options.maxDelayMs || 4000;
    this.lastActionTime = 0;
  }

  async throttle() {
    const now = Date.now();
    const elapsed = now - this.lastActionTime;
    const requiredDelay = Math.floor(Math.random() * (this.maxDelayMs - this.minDelayMs)) + this.minDelayMs;

    if (elapsed < requiredDelay) {
      await delay(requiredDelay - elapsed);
    }
    this.lastActionTime = Date.now();
  }
}

export default NaukriRateLimiter;
