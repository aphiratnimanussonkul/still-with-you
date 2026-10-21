import { FastifyPluginAsync } from 'fastify';
import { db, family, familyMember, account, auditLog } from '../lib/db/index.js';
import { eq, and, isNull } from 'drizzle-orm';
import { createFamilySchema, inviteMemberSchema, updateMemberRoleSchema, AppError, ErrorCode } from '@still-with-you/contracts';

/**
 * Family and member management routes
 * POST /v1/families - Create family
 * GET /v1/families/:fid - Get family
 * POST /v1/families/:fid/invites - Invite member (admin only)
 * PATCH /v1/families/:fid/members/:aid - Update role (admin only)
 * DELETE /v1/families/:fid/members/:aid - Remove member (admin only)
 */
const familyRoutes: FastifyPluginAsync = async (fastify) => {
  // Helper: Check if user is active member
  async function checkActiveMember(familyId: string, accountId: string) {
    const [member] = await db
      .select()
      .from(familyMember)
      .where(and(eq(familyMember.familyId, familyId), eq(familyMember.accountId, accountId), isNull(familyMember.leftAt)))
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
      throw new AppError(ErrorCode.ADMIN_REQUIRED, 'This action requires admin role', 403);
    }

    return member;
  }

  // Create family (creator becomes first admin via trigger)
  fastify.post('/families', async (request, reply) => {
    const body = createFamilySchema.parse(request.body);

    const [newFamily] = await db
      .insert(family)
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

    const [familyData] = await db.select().from(family).where(eq(family.id, fid)).limit(1);

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

  // Invite member (admin only)
  fastify.post<{ Params: { fid: string } }>('/families/:fid/invites', async (request, reply) => {
    const { fid } = request.params;
    const body = inviteMemberSchema.parse(request.body);

    // Check admin permission
    await checkAdmin(fid, request.user!.id);

    // Find account by email
    const [inviteeAccount] = await db.select().from(account).where(eq(account.email, body.email)).limit(1);

    if (!inviteeAccount) {
      throw new AppError(ErrorCode.NOT_FOUND, 'Account with this email not found', 404);
    }

    // Check if already a member
    const [existing] = await db
      .select()
      .from(familyMember)
      .where(and(eq(familyMember.familyId, fid), eq(familyMember.accountId, inviteeAccount.id)))
      .limit(1);

    if (existing && !existing.leftAt) {
      throw new AppError(ErrorCode.FORBIDDEN, 'User is already a member', 403);
    }

    // Add as member (or rejoin)
    if (existing && existing.leftAt) {
      await db
        .update(familyMember)
        .set({ leftAt: null, joinedAt: new Date(), role: 'member' })
        .where(and(eq(familyMember.familyId, fid), eq(familyMember.accountId, inviteeAccount.id)));
    } else {
      await db.insert(familyMember).values({
        familyId: fid,
        accountId: inviteeAccount.id,
        role: 'member',
      });
    }

    // Audit log
    await db.insert(auditLog).values({
      actorAccountId: request.user!.id,
      action: 'member_invite',
      targetType: 'family_member',
      targetId: inviteeAccount.id,
    });

    return reply.status(201).send({ success: true });
  });

  // Update member role (admin only)
  fastify.patch<{ Params: { fid: string; aid: string } }>('/families/:fid/members/:aid', async (request, reply) => {
    const { fid, aid } = request.params;
    const body = updateMemberRoleSchema.parse(request.body);

    // Check admin permission
    await checkAdmin(fid, request.user!.id);

    // Get target member
    const targetMember = await checkActiveMember(fid, aid);

    // Update role
    await db
      .update(familyMember)
      .set({ role: body.role })
      .where(and(eq(familyMember.familyId, fid), eq(familyMember.accountId, aid)));

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

    // Set left_at (soft delete)
    await db
      .update(familyMember)
      .set({ leftAt: new Date() })
      .where(and(eq(familyMember.familyId, fid), eq(familyMember.accountId, aid)));

    // Audit log
    await db.insert(auditLog).values({
      actorAccountId: request.user!.id,
      action: 'member_remove',
      targetType: 'family_member',
      targetId: aid,
    });

    return reply.status(204).send();
  });
};

export default familyRoutes;
