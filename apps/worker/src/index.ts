/**
 * Outbox Worker
 * 
 * Reads the outbox table and processes async jobs:
 * - Purges storage files when ref_count reaches 0
 * - Sends notifications
 * 
 * TODO: Implement outbox processing
 * TODO: Implement blob cleanup when ref_count = 0
 */

console.log('Worker started (STUB - not yet implemented)');

// Keep the process alive
setInterval(() => {
  console.log('Worker heartbeat');
}, 30000);
