import type { ActionAPIContext } from "astro:actions";
import { ActionError, defineAction } from "astro:actions";
import { z } from "astro:schema";
import {
  WellnessAreas,
  WellnessGoals,
  WellnessReflections,
  and,
  db,
  eq,
} from "astro:db";

function requireUser(context: ActionAPIContext) {
  const locals = context.locals as App.Locals | undefined;
  const user = locals?.user;

  if (!user) {
    throw new ActionError({
      code: "UNAUTHORIZED",
      message: "You must be signed in to perform this action.",
    });
  }

  return user;
}

async function ensureAreaOwnership(areaId: string, userId: string) {
  const [area] = await db
    .select()
    .from(WellnessAreas)
    .where(and(eq(WellnessAreas.id, areaId), eq(WellnessAreas.userId, userId)));

  if (!area) {
    throw new ActionError({
      code: "NOT_FOUND",
      message: "Wellness area not found.",
    });
  }

  return area;
}

async function ensureGoalOwnership(goalId: string, userId: string) {
  const [goal] = await db
    .select()
    .from(WellnessGoals)
    .where(and(eq(WellnessGoals.id, goalId), eq(WellnessGoals.userId, userId)));

  if (!goal) {
    throw new ActionError({
      code: "NOT_FOUND",
      message: "Wellness goal not found.",
    });
  }

  return goal;
}

function combineConditions(conditions: ReturnType<typeof eq>[]) {
  return conditions.reduce((acc, condition) => (acc ? and(acc, condition) : condition));
}

export const server = {
  listWellnessAreas: defineAction({
    handler: async (_, context) => {
      const user = requireUser(context);

      const areas = await db
        .select()
        .from(WellnessAreas)
        .where(eq(WellnessAreas.userId, user.id));

      return {
        success: true,
        data: {
          items: areas,
          total: areas.length,
        },
      };
    },
  }),

  createWellnessArea: defineAction({
    input: z.object({
      name: z.string().min(1),
      description: z.string().optional(),
      icon: z.string().optional(),
      sortOrder: z.number().int().optional(),
    }),
    handler: async (input, context) => {
      const user = requireUser(context);
      const now = new Date();
      const area = {
        id: crypto.randomUUID(),
        userId: user.id,
        name: input.name,
        description: input.description,
        icon: input.icon,
        sortOrder: input.sortOrder,
        createdAt: now,
        updatedAt: now,
      } satisfies typeof WellnessAreas.$inferInsert;

      await db.insert(WellnessAreas).values(area);

      return { success: true, data: { area } };
    },
  }),

  updateWellnessArea: defineAction({
    input: z.object({
      id: z.string(),
      name: z.string().min(1).optional(),
      description: z.string().optional(),
      icon: z.string().optional(),
      sortOrder: z.number().int().optional(),
    }),
    handler: async (input, context) => {
      const user = requireUser(context);
      await ensureAreaOwnership(input.id, user.id);

      const now = new Date();
      const updateData: Record<string, unknown> = {
        updatedAt: now,
      };

      if (input.name !== undefined) updateData.name = input.name;
      if (input.description !== undefined) updateData.description = input.description;
      if (input.icon !== undefined) updateData.icon = input.icon;
      if (input.sortOrder !== undefined) updateData.sortOrder = input.sortOrder;

      await db
        .update(WellnessAreas)
        .set(updateData)
        .where(and(eq(WellnessAreas.id, input.id), eq(WellnessAreas.userId, user.id)));

      const [area] = await db
        .select()
        .from(WellnessAreas)
        .where(and(eq(WellnessAreas.id, input.id), eq(WellnessAreas.userId, user.id)));

      return { success: true, data: { area } };
    },
  }),

  deleteWellnessArea: defineAction({
    input: z.object({ id: z.string() }),
    handler: async (input, context) => {
      const user = requireUser(context);
      const area = await ensureAreaOwnership(input.id, user.id);

      await db
        .delete(WellnessReflections)
        .where(
          and(
            eq(WellnessReflections.userId, user.id),
            eq(WellnessReflections.areaId, area.id),
          ),
        );

      await db
        .delete(WellnessGoals)
        .where(and(eq(WellnessGoals.userId, user.id), eq(WellnessGoals.areaId, area.id)));

      await db
        .delete(WellnessAreas)
        .where(and(eq(WellnessAreas.id, area.id), eq(WellnessAreas.userId, user.id)));

      return { success: true };
    },
  }),

  listWellnessGoals: defineAction({
    input: z.object({
      areaId: z.string().optional(),
    }),
    handler: async (input, context) => {
      const user = requireUser(context);

      if (input.areaId) {
        await ensureAreaOwnership(input.areaId, user.id);
      }

      const conditions = [eq(WellnessGoals.userId, user.id)];
      if (input.areaId) {
        conditions.push(eq(WellnessGoals.areaId, input.areaId));
      }

      const goals = await db
        .select()
        .from(WellnessGoals)
        .where(combineConditions(conditions));

      return {
        success: true,
        data: {
          items: goals,
          total: goals.length,
        },
      };
    },
  }),

  createWellnessGoal: defineAction({
    input: z.object({
      areaId: z.string().optional(),
      title: z.string().min(1),
      description: z.string().optional(),
      targetDate: z.coerce.date().optional(),
      status: z.enum(["not-started", "in-progress", "completed", "paused"]).optional(),
      priority: z.enum(["low", "medium", "high"]).optional(),
      progressPercent: z.number().int().min(0).max(100).optional(),
    }),
    handler: async (input, context) => {
      const user = requireUser(context);
      const now = new Date();

      if (input.areaId) {
        await ensureAreaOwnership(input.areaId, user.id);
      }

      const goal = {
        id: crypto.randomUUID(),
        userId: user.id,
        areaId: input.areaId,
        title: input.title,
        description: input.description,
        targetDate: input.targetDate,
        status: input.status ?? "not-started",
        priority: input.priority ?? "medium",
        progressPercent: input.progressPercent,
        createdAt: now,
        updatedAt: now,
      } satisfies typeof WellnessGoals.$inferInsert;

      await db.insert(WellnessGoals).values(goal);

      return { success: true, data: { goal } };
    },
  }),

  updateWellnessGoal: defineAction({
    input: z.object({
      id: z.string(),
      areaId: z.string().optional(),
      title: z.string().min(1).optional(),
      description: z.string().optional(),
      targetDate: z.coerce.date().optional(),
      status: z.enum(["not-started", "in-progress", "completed", "paused"]).optional(),
      priority: z.enum(["low", "medium", "high"]).optional(),
      progressPercent: z.number().int().min(0).max(100).optional(),
    }),
    handler: async (input, context) => {
      const user = requireUser(context);
      await ensureGoalOwnership(input.id, user.id);

      if (input.areaId) {
        await ensureAreaOwnership(input.areaId, user.id);
      }

      const now = new Date();
      const updateData: Record<string, unknown> = {
        updatedAt: now,
      };

      if (input.areaId !== undefined) updateData.areaId = input.areaId;
      if (input.title !== undefined) updateData.title = input.title;
      if (input.description !== undefined) updateData.description = input.description;
      if (input.targetDate !== undefined) updateData.targetDate = input.targetDate;
      if (input.status !== undefined) updateData.status = input.status;
      if (input.priority !== undefined) updateData.priority = input.priority;
      if (input.progressPercent !== undefined) updateData.progressPercent = input.progressPercent;

      await db
        .update(WellnessGoals)
        .set(updateData)
        .where(and(eq(WellnessGoals.id, input.id), eq(WellnessGoals.userId, user.id)));

      const [goal] = await db
        .select()
        .from(WellnessGoals)
        .where(and(eq(WellnessGoals.id, input.id), eq(WellnessGoals.userId, user.id)));

      return { success: true, data: { goal } };
    },
  }),

  deleteWellnessGoal: defineAction({
    input: z.object({ id: z.string() }),
    handler: async (input, context) => {
      const user = requireUser(context);
      const goal = await ensureGoalOwnership(input.id, user.id);

      await db
        .delete(WellnessReflections)
        .where(and(eq(WellnessReflections.userId, user.id), eq(WellnessReflections.goalId, goal.id)));

      await db
        .delete(WellnessGoals)
        .where(and(eq(WellnessGoals.id, goal.id), eq(WellnessGoals.userId, user.id)));

      return { success: true };
    },
  }),

  listWellnessReflections: defineAction({
    input: z.object({
      areaId: z.string().optional(),
      goalId: z.string().optional(),
      page: z.number().int().positive().default(1),
      pageSize: z.number().int().positive().max(100).default(20),
    }),
    handler: async (input, context) => {
      const user = requireUser(context);

      if (input.areaId) {
        await ensureAreaOwnership(input.areaId, user.id);
      }

      if (input.goalId) {
        const goal = await ensureGoalOwnership(input.goalId, user.id);
        if (input.areaId && goal.areaId && goal.areaId !== input.areaId) {
          throw new ActionError({
            code: "BAD_REQUEST",
            message: "Goal does not belong to the specified area.",
          });
        }
      }

      const conditions = [eq(WellnessReflections.userId, user.id)];
      if (input.areaId) {
        conditions.push(eq(WellnessReflections.areaId, input.areaId));
      }
      if (input.goalId) {
        conditions.push(eq(WellnessReflections.goalId, input.goalId));
      }

      const offset = (input.page - 1) * input.pageSize;

      const reflections = await db
        .select()
        .from(WellnessReflections)
        .where(combineConditions(conditions))
        .limit(input.pageSize)
        .offset(offset);

      return {
        success: true,
        data: {
          items: reflections,
          total: reflections.length,
          page: input.page,
          pageSize: input.pageSize,
        },
      };
    },
  }),

  createWellnessReflection: defineAction({
    input: z.object({
      areaId: z.string().optional(),
      goalId: z.string().optional(),
      entryDate: z.coerce.date().optional(),
      mood: z.string().optional(),
      energyLevel: z.number().int().min(1).max(10).optional(),
      notes: z.string().optional(),
    }),
    handler: async (input, context) => {
      const user = requireUser(context);
      const now = new Date();

      if (input.areaId) {
        await ensureAreaOwnership(input.areaId, user.id);
      }

      if (input.goalId) {
        const goal = await ensureGoalOwnership(input.goalId, user.id);
        if (input.areaId && goal.areaId && goal.areaId !== input.areaId) {
          throw new ActionError({
            code: "BAD_REQUEST",
            message: "Goal does not belong to the specified area.",
          });
        }
      }

      const reflection = {
        id: crypto.randomUUID(),
        userId: user.id,
        areaId: input.areaId,
        goalId: input.goalId,
        entryDate: input.entryDate ?? now,
        mood: input.mood,
        energyLevel: input.energyLevel,
        notes: input.notes,
        createdAt: now,
      } satisfies typeof WellnessReflections.$inferInsert;

      await db.insert(WellnessReflections).values(reflection);

      return { success: true, data: { reflection } };
    },
  }),

  deleteWellnessReflection: defineAction({
    input: z.object({ id: z.string() }),
    handler: async (input, context) => {
      const user = requireUser(context);

      const [reflection] = await db
        .select()
        .from(WellnessReflections)
        .where(
          and(
            eq(WellnessReflections.id, input.id),
            eq(WellnessReflections.userId, user.id),
          ),
        );

      if (!reflection) {
        throw new ActionError({
          code: "NOT_FOUND",
          message: "Wellness reflection not found.",
        });
      }

      await db
        .delete(WellnessReflections)
        .where(
          and(
            eq(WellnessReflections.id, input.id),
            eq(WellnessReflections.userId, user.id),
          ),
        );

      return { success: true };
    },
  }),
};
