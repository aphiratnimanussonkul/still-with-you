/**
 * Outbox Worker
 * 
 * Processes async jobs:
 * - Expires invites past their expiration date
 * - Purges storage files when ref_count reaches 0 (TODO)
 * - Sends notifications (TODO)
 */

import postgres from 'postgres';

const sql = postgres(process.env.DATABASE_URL || '');

console.log('Worker started');

// Expire old invites every 5 minutes
async function expireInvites() {
  try {
    const result = await sql`
      UPDATE invites
      SET status = 'expired'
      WHERE status = 'pending'
        AND expires_at < NOW()
    `;
    
    if (result.count > 0) {
      console.log(`Expired ${result.count} invites`);
    }
  } catch (error) {
    console.error('Error expiring invites:', error);
  }
}

// Run immediately on startup
expireInvites();

// Then run every 5 minutes
setInterval(expireInvites, 5 * 60 * 1000);

// Heartbeat
setInterval(() => {
  console.log('Worker heartbeat');
}, 30000);
