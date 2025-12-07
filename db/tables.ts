/**
 * Wellness & Goal Planner - combine wellness areas and goals.
 *
 * Design goals:
 * - Wellness areas (Health, Mind, Relationships, Finance).
 * - Goals under each area with progress tracking.
 * - Simple reflection log for journaling.
 */

import { defineTable, column, NOW } from "astro:db";

export const WellnessAreas = defineTable({
  columns: {
    id: column.text({ primaryKey: true }),
    userId: column.text(),

    name: column.text(),                          // "Physical Health", "Mental Health"
    description: column.text({ optional: true }),
    icon: column.text({ optional: true }),        // emoji or icon key
    sortOrder: column.number({ optional: true }),

    createdAt: column.date({ default: NOW }),
    updatedAt: column.date({ default: NOW }),
  },
});

export const WellnessGoals = defineTable({
  columns: {
    id: column.text({ primaryKey: true }),
    areaId: column.text({
      references: () => WellnessAreas.columns.id,
      optional: true,
    }),
    userId: column.text(),

    title: column.text(),                         // "Walk 8000 steps daily"
    description: column.text({ optional: true }),
    targetDate: column.date({ optional: true }),
    status: column.text({ optional: true }),      // "not-started", "in-progress", "completed", "paused"
    priority: column.text({ optional: true }),    // "low", "medium", "high"

    progressPercent: column.number({ optional: true }), // 0-100 cached

    createdAt: column.date({ default: NOW }),
    updatedAt: column.date({ default: NOW }),
  },
});

export const WellnessReflections = defineTable({
  columns: {
    id: column.text({ primaryKey: true }),
    userId: column.text(),

    areaId: column.text({
      references: () => WellnessAreas.columns.id,
      optional: true,
    }),
    goalId: column.text({
      references: () => WellnessGoals.columns.id,
      optional: true,
    }),

    entryDate: column.date({ default: NOW }),
    mood: column.text({ optional: true }),        // "great", "okay", "tired", etc.
    energyLevel: column.number({ optional: true }), // 1-10
    notes: column.text({ optional: true }),

    createdAt: column.date({ default: NOW }),
  },
});

export const tables = {
  WellnessAreas,
  WellnessGoals,
  WellnessReflections,
} as const;
