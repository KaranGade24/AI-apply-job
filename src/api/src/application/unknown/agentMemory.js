/**
 * AgentMemory manages active execution steps, trace logs, and failure counters.
 */
export class AgentMemory {
  constructor() {
    this.memory = '';
    this.history = [];
    this.consecutiveFailures = 0;
  }

  /**
   * Appends an entry to history and updates memory state.
   */
  update(memoryText, entry) {
    this.memory = memoryText || this.memory;
    if (entry) {
      this.history.push({
        step: this.history.length + 1,
        url: entry.url,
        pageType: entry.pageType,
        goal: entry.goal,
        actions: entry.actions,
        results: entry.results,
        pageChanged: entry.pageChanged,
        error: entry.error,
        timestamp: Date.now()
      });
    }
  }

  recordFailure() {
    this.consecutiveFailures++;
  }

  resetFailures() {
    this.consecutiveFailures = 0;
  }
}

export default AgentMemory;
