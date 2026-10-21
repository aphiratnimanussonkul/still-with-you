import { FastifyPluginAsync } from 'fastify';
import { db, families, familyMembers, accounts, auditLog, invites } from '../lib/db/index.js';
import { eq, and, isNull } from 'drizzle-orm';
import { createFamilySchema, inviteMemberSchema, updateMemberRoleSchema, AppError, ErrorCode } from '@still-with-you/contracts';
import crypto from 'crypto';

/**
 * Family and member management routes
 * POST /v1/families - Create family
 * GET /v1/families/:fid - Get family
 * POST /v1/families/:fid/invites - Create invite (admin only)
 * GET /v1/families/:fid/invites - List pending invites (admin only)
 * POST /v1/invites/:token/accept - Accept invite
 * DELETE /v1/invites/:id - Revoke invite (admin only)
 * PATCH /v1/families/:fid/members/:aid - Update role (admin only)
 * DELETE /v1/families/:fid/members/:aid - Remove member (admin only)
 * POST /v1/families/:fid/leave - Leave family (self)
 */
const familyRoutes: FastifyPluginAsync = async (fastify) => {
  // Helper: Check if user is active member
  async function checkActiveMember(familyId: string, accountId: string) {
    const [member] = await db
      .select()
      .from(familyMembers)
      .where(and(eq(familyMembers.familyId, familyId), eq(familyMembers.accountId, accountId), isNull(familyMembers.leftAt)))
      .limit(1);

    if (!member) {
      throw new AppError(ErrorCode.FORBIDDEN, 'You are not a member of this family', 403);
    }

    return member;
  }

  // Helper: Check if user is admin
  async function checkAdmin(familyId: string, accountId: string) {
    const member = await checkActiveMember(familyId, accountId);

    if (member.role !== 'admin') {
      throw new AppError(ErrorCode.FORBIDDEN, 'This action requires admin role', 403);
    }

    return member;
  }

  // Create family (creator becomes first admin via trigger)
  fastify.post('/families', async (request, reply) => {
    const body = createFamilySchema.parse(request.body);

    const [newFamily] = await db
      .insert(families)
      .values({
        name: body.name,
        createdBy: request.user!.id,
      })
      .returning();

    return reply.status(201).send({
      id: newFamily.id,
      name: newFamily.name,
      created_by: newFamily.createdBy,
      created_at: newFamily.createdAt.toISOString(),
    });
  });

  // Get family details
  fastify.get<{ Params: { fid: string } }>('/families/:fid', async (request, reply) => {
    const { fid } = request.params;

    // Check membership
    await checkActiveMember(fid, request.user!.id);

    const [familyData] = await db.select().from(families).where(eq(families.id, fid)).limit(1);

    if (!familyData) {
      throw new AppError(ErrorCode.NOT_FOUND, 'Family not found', 404);
    }

    return reply.send({
      id: familyData.id,
      name: familyData.name,
      created_by: familyData.createdBy,
      created_at: familyData.createdAt.toISOString(),
    });
  });

  // Create invite (admin only)
  fastify.post<{ Params: { fid: string } }>('/families/:fid/invites', async (request, reply) => {
    const { fid } = request.params;
    const body = inviteMemberSchema.parse(request.body);

    // Check admin permission
    await checkAdmin(fid, request.user!.id);

    // Check if account exists
    const [inviteeAccount] = await db.select().from(accounts).where(eq(accounts.email, body.email)).limit(1);

    if (!inviteeAccount) {
      throw new AppError(ErrorCode.NOT_FOUND, 'Account with this email not found', 404);
    }

    // Check if already a member
    const [existing] = await db
      .select()
      .from(familyMembers)
      .where(and(eq(familyMembers.familyId, fid), eq(familyMembers.accountId, inviteeAccount.id)))
      .limit(1);

    if (existing && !existing.leftAt) {
      throw new AppError(ErrorCode.FORBIDDEN, 'User is already a member', 403);
    }

    // Check for pending invite
    const [pendingInvite] = await db
      .select()
      .from(invites)
      .where(and(eq(invites.familyId, fid), eq(invites.email, body.email), eq(invites.status, 'pending')))
      .limit(1);

    if (pendingInvite) {
      throw new AppError(ErrorCode.FORBIDDEN, 'Invite already pending for this email', 403);
    }

    // Generate secure token
    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    // Create invite (expires in 7 days)
    const [invite] = await db
      .insert(invites)
      .values({
        familyId: fid,
        email: body.email,
        role: 'member',
        invitedBy: request.user!.id,
        tokenHash,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      })
      .returning();

    // Audit log
    await db.insert(auditLog).values({
      actorAccountId: request.user!.id,
      action: 'invite_create',
      targetType: 'invite',
      targetId: invite.id,
    });

    return reply.status(201).send({
      id: invite.id,
      email: invite.email,
      token, // Only returned on creation
      expires_at: invite.expiresAt.toISOString(),
    });
  });

  // List pending invites (admin only)
  fastify.get<{ Params: { fid: string } }>('/families/:fid/invites', async (request, reply) => {
    const { fid } = request.params;

    // Check admin permission
    await checkAdmin(fid, request.user!.id);

    const pendingInvites = await db
      .select({
        id: invites.id,
        email: invites.email,
        role: invites.role,
        invited_by: invites.invitedBy,
        expires_at: invites.expiresAt,
        created_at: invites.createdAt,
      })
      .from(invites)
      .where(and(eq(invites.familyId, fid), eq(invites.status, 'pending')));

    return reply.send({
      invites: pendingInvites.map((inv) => ({
        ...inv,
        expires_at: inv.expires_at.toISOString(),
        created_at: inv.created_at.toISOString(),
      })),
    });
  });

  // Accept invite (concurrency-safe)
  fastify.post<{ Params: { token: string } }>('/invites/:token/accept', async (request, reply) => {
    const { token } = request.params;
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    // Atomically update invite from pending to accepted (concurrency-safe)
    const [invite] = await db
      .update(invites)
      .set({ status: 'accepted', acceptedAt: new Date() })
      .where(and(eq(invites.tokenHash, tokenHash), eq(invites.status, 'pending')))
      .returning();

    if (!invite) {
      // Check if invite exists but not pending
      const [existingInvite] = await db.select().from(invites).where(eq(invites.tokenHash, tokenHash)).limit(1);

      if (!existingInvite) {
        throw new AppError(ErrorCode.NOT_FOUND, 'Invite not found', 404);
      }

      if (existingInvite.status === 'expired' || existingInvite.expiresAt < new Date()) {
        throw new AppError(ErrorCode.FORBIDDEN, 'Invite has expired', 403);
      }

      throw new AppError(ErrorCode.FORBIDDEN, 'Invite already used or revoked', 403);
    }

    // Check expiration
    if (invite.expiresAt < new Date()) {
      await db.update(invites).set({ status: 'expired' }).where(eq(invites.id, invite.id));
      throw new AppError(ErrorCode.FORBIDDEN, 'Invite has expired', 403);
    }

    // Verify email matches (case-insensitive, citext handles this)
    if (invite.email.toLowerCase() !== request.user!.email!.toLowerCase()) {
      // Revert the invite status
      await db.update(invites).set({ status: 'pending', acceptedAt: null }).where(eq(invites.id, invite.id));
      throw new AppError(ErrorCode.FORBIDDEN, 'This invite is for a different email address', 403);
    }

    // Check if already a member
    const [existing] = await db
      .select()
      .from(familyMembers)
      .where(and(eq(familyMembers.familyId, invite.familyId), eq(familyMembers.accountId, request.user!.id)))
      .limit(1);

    if (existing && !existing.leftAt) {
      throw new AppError(ErrorCode.FORBIDDEN, 'You are already a member', 403);
    }

    // Add as member (or rejoin)
    if (existing && existing.leftAt) {
      await db
        .update(familyMembers)
        .set({ leftAt: null, joinedAt: new Date(), role: invite.role })
        .where(and(eq(familyMembers.familyId, invite.familyId), eq(familyMembers.accountId, request.user!.id)));
    } else {
      await db.insert(familyMembers).values({
        familyId: invite.familyId,
        accountId: request.user!.id,
        role: invite.role,
      });
    }

    // Audit log
    await db.insert(auditLog).values({
      actorAccountId: request.user!.id,
      action: 'invite_accept',
      targetType: 'invite',
      targetId: invite.id,
    });

    return reply.send({ success: true, family_id: invite.familyId });
  });

  // Revoke invite (admin only)
  fastify.delete<{ Params: { id: string } }>('/invites/:id', async (request, reply) => {
    const { id } = request.params;

    // Get invite
    const [invite] = await db.select().from(invites).where(eq(invites.id, id)).limit(1);

    if (!invite) {
      throw new AppError(ErrorCode.NOT_FOUND, 'Invite not found', 404);
    }

    // Check admin permission
    await checkAdmin(invite.familyId, request.user!.id);

    if (invite.status !== 'pending') {
      throw new AppError(ErrorCode.FORBIDDEN, 'Can only revoke pending invites', 403);
    }

    // Mark as revoked
    await db.update(invites).set({ status: 'revoked' }).where(eq(invites.id, id));

    // Audit log
    await db.insert(auditLog).values({
      actorAccountId: request.user!.id,
      action: 'invite_revoke',
      targetType: 'invite',
      targetId: id,
    });

    return reply.status(204).send();
  });

  // Update member role (admin only)
  fastify.patch<{ Params: { fid: string; aid: string } }>('/families/:fid/members/:aid', async (request, reply) => {
    const { fid, aid } = request.params;
    const body = updateMemberRoleSchema.parse(request.body);

    // Check admin permission
    await checkAdmin(fid, request.user!.id);

    // Get target member
    await checkActiveMember(fid, aid);

    // Update role (last admin check is in database trigger)
    await db
      .update(familyMembers)
      .set({ role: body.role })
      .where(and(eq(familyMembers.familyId, fid), eq(familyMembers.accountId, aid)));

    // Audit log
    await db.insert(auditLog).values({
      actorAccountId: request.user!.id,
      action: 'member_role_update',
      targetType: 'family_member',
      targetId: aid,
    });

    return reply.send({ success: true });
  });

  // Remove member (admin only)
  fastify.delete<{ Params: { fid: string; aid: string } }>('/families/:fid/members/:aid', async (request, reply) => {
    const { fid, aid } = request.params;

    // Check admin permission
    await checkAdmin(fid, request.user!.id);

    // Check target member exists
    await checkActiveMember(fid, aid);

    // Set left_at (soft delete, last admin check is in database trigger)
    await db
      .update(familyMembers)
      .set({ leftAt: new Date() })
      .where(and(eq(familyMembers.familyId, fid), eq(familyMembers.accountId, aid)));

    // Audit log
    await db.insert(auditLog).values({
      actorAccountId: request.user!.id,
      action: 'member_remove',
      targetType: 'family_member',
      targetId: aid,
    });

    return reply.status(204).send();
  });

  // Leave family (self)
  fastify.post<{ Params: { fid: string } }>('/families/:fid/leave', async (request, reply) => {
    const { fid } = request.params;

    // Check membership
    await checkActiveMember(fid, request.user!.id);

    // Set left_at (last admin check is in database trigger)
    await db
      .update(familyMembers)
      .set({ leftAt: new Date() })
      .where(and(eq(familyMembers.familyId, fid), eq(familyMembers.accountId, request.user!.id)));

    // Audit log
    await db.insert(auditLog).values({
      actorAccountId: request.user!.id,
      action: 'member_leave',
      targetType: 'family_member',
      targetId: request.user!.id,
    });

    return reply.send({ success: true });
  });
};

export default familyRoutes;
