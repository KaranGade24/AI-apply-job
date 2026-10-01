/**
 * @deprecated Use src/api/src/browser/browserActionExecutor.js instead.
 * Re-export wrapper for backward compatibility.
 */
import * as canonical from '../../browser/browserActionExecutor.js';

export const executeSingleBrowserAction = canonical.executeSingleBrowserAction;
export const executeBrowserActions = canonical.executeBrowserActions;
export default canonical.executeSingleBrowserAction;
