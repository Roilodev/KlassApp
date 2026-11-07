import { describe, expect, it, vi } from 'vitest';
import { DatabaseService } from '../database/database.service.js';
import { DashboardService } from './dashboard.service.js';

describe('DashboardService', () => {
  it('returns school-wide counts and setup indicators for administrators', async () => {
    const query = vi.fn(async () => ({
      rows: [{
        students: 12,
        classes: 4,
        teachers: 5,
        schedules: 20,
        events: 3,
        assessments: 8,
        behavior_records: 6,
        students_missing_responsible: 2,
        active_assigned_teachers: 3,
      }],
      rowCount: 1,
    }));
    const service = new DashboardService({ query } as unknown as DatabaseService);

    await expect(service.getSummary('school-id', 'admin-id', 'admin')).resolves.toEqual({
      students: 12,
      classes: 4,
      teachers: 5,
      schedules: 20,
      events: 3,
      assessments: 8,
      behaviorRecords: 6,
      studentsMissingResponsible: 2,
      activeAssignedTeachers: 3,
    });
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('behavior_records'),
      ['school-id', 'admin-id', 'admin'],
    );
  });

  it('returns only assigned data and omits administrative-only counts for teachers', async () => {
    const query = vi.fn(async () => ({
      rows: [{
        students: 4,
        classes: 2,
        teachers: null,
        schedules: 7,
        events: null,
        assessments: 5,
        behavior_records: 3,
        students_missing_responsible: null,
        active_assigned_teachers: null,
      }],
      rowCount: 1,
    }));
    const service = new DashboardService({ query } as unknown as DatabaseService);

    await expect(service.getSummary('school-id', 'teacher-id', 'teacher')).resolves.toEqual({
      students: 4,
      classes: 2,
      teachers: null,
      schedules: 7,
      events: null,
      assessments: 5,
      behaviorRecords: 3,
      studentsMissingResponsible: null,
      activeAssignedTeachers: null,
    });
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('teacher_class_assignments'),
      ['school-id', 'teacher-id', 'teacher'],
    );
  });
});
