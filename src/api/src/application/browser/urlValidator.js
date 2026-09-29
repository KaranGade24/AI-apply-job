import { KNOWN_ATS_DOMAINS } from '../../constant/application.constant.js';
import { logJobEvent } from '../../utils/logger.js';

/**
 * Validates navigation targets before execution to protect against prompt injection
 * and navigation away from legitimate career / job application pages.
 *
 * Rules:
 * 1. Same domain as current page -> allowed
 * 2. Known ATS domains (greenhouse.io, lever.co, workday, etc.) -> allowed
 * 3. URL observed on the current page (in extracted links or buttons) -> allowed
 * 4. Valid redirect from a user action -> allowed
 * 5. Unknown external URL not observed on page -> rejected
 *
 * @param {string} targetUrl - URL the agent wants to navigate to
 * @param {object} agentState - Current agent state with visitedPages and currentPage
 * @param {object} [normalizedState] - Current normalized page state with links and buttons
 * @returns {{ safe: boolean, reason: string }}
 */
export const isUrlSafe = (targetUrl, agentState = {}, normalizedState = null) => {
  if (!targetUrl || typeof targetUrl !== 'string') {
    return { safe: false, reason: 'Target URL is missing or not a string.' };
  }

  const trimmed = targetUrl.trim();
  if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) {
    return { safe: false, reason: 'Target URL is not a valid HTTP/HTTPS URL.' };
  }

  let parsedTarget;
  try {
    parsedTarget = new URL(trimmed);
  } catch {
    return { safe: false, reason: `Malformed URL: ${trimmed}` };
  }

  const targetHost = parsedTarget.hostname.toLowerCase();

  // 1. Check known ATS domains
  const isKnownAts = KNOWN_ATS_DOMAINS.some(
    (domain) => targetHost === domain.toLowerCase() || targetHost.endsWith(`.${domain.toLowerCase()}`)
  );
  if (isKnownAts) {
    return { safe: true, reason: `Matches trusted ATS domain: ${targetHost}` };
  }

  // 2. Check same domain as current page or start URL
  const currentUrl = agentState?.currentPage?.url || agentState?.visitedPages?.[0]?.url;
  if (currentUrl) {
    try {
      const currentHost = new URL(currentUrl).hostname.toLowerCase();
      if (targetHost === currentHost || targetHost.endsWith(`.${currentHost}`) || currentHost.endsWith(`.${targetHost}`)) {
        return { safe: true, reason: `Same domain or subdomain as current page: ${currentHost}` };
      }
    } catch {
      // ignore parsing error on currentUrl
    }
  }

  // 3. Check if target URL was observed on the page (in links, buttons, or form actions)
  if (normalizedState) {
    const observedLinks = normalizedState.links || [];
    const linkFound = observedLinks.some((l) => {
      const href = (l.href || '').trim();
      return href === trimmed || href.toLowerCase() === trimmed.toLowerCase();
    });
    if (linkFound) {
      return { safe: true, reason: 'URL was observed in page links.' };
    }

    const observedButtons = normalizedState.buttons || [];
    const buttonFound = observedButtons.some((b) => {
      const action = (b.actionUrl || b.href || '').trim();
      return action === trimmed || action.toLowerCase() === trimmed.toLowerCase();
    });
    if (buttonFound) {
      return { safe: true, reason: 'URL was observed in page interactive buttons.' };
    }
  }

  // 4. Check if any previously visited page had this domain
  const visitedPages = agentState?.visitedPages || [];
  for (const visit of visitedPages) {
    if (!visit.url) continue;
    try {
      const vHost = new URL(visit.url).hostname.toLowerCase();
      if (targetHost === vHost || targetHost.endsWith(`.${vHost}`) || vHost.endsWith(`.${targetHost}`)) {
        return { safe: true, reason: `Domain previously visited in this session: ${vHost}` };
      }
    } catch {
      // ignore
    }
  }

  // Rejected by default (prompt injection defense)
  logJobEvent('urlValidator', 'REJECTED', `Blocked navigation to unverified URL: ${trimmed}`);
  return {
    safe: false,
    reason: `External URL not verified against known ATS whitelist, same-domain policy, or page DOM elements: ${targetHost}`,
  };
};
