import { describe, expect, it, vi } from 'vitest';
import { DatabaseService } from '../database/database.service.js';
import { DashboardService } from './dashboard.service.js';

describe('DashboardService', () => {
  it('returns school-wide counts and setup indicators for administrators', async () => {
    const query = vi.fn(async () => ({
      rows: [{
        students: 12,
        classes: 4,
        subjects: 7,
        teachers: 5,
        active_teachers: 5,
        required_teachers: 2,
        configured_subject_frequencies: 7,
        schedules: 20,
        classes_with_incomplete_schedules: 0,
        events: 3,
        assessments: 8,
        behavior_records: 6,
        students_missing_responsible: 2,
        active_assigned_teachers: 3,
        configured_events: 4,
        morning_session_periods: 3,
        afternoon_session_periods: 2,
        configured_students: 14,
      }],
      rowCount: 1,
    }));
    const service = new DashboardService({ query } as unknown as DatabaseService);

    await expect(service.getSummary('school-id', 'admin-id', 'admin')).resolves.toEqual({
      students: 12,
      classes: 4,
      subjects: 7,
      teachers: 5,
      activeTeachers: 5,
      requiredTeachers: 2,
      configuredSubjectFrequencies: 7,
      schedules: 20,
      classesWithIncompleteSchedules: 0,
      events: 3,
      assessments: 8,
      behaviorRecords: 6,
      studentsMissingResponsible: 2,
      activeAssignedTeachers: 3,
      configuredEvents: 4,
      morningSessionPeriods: 3,
      afternoonSessionPeriods: 2,
      configuredStudents: 14,
    });
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('behavior_records'),
      ['school-id', 'admin-id', 'admin'],
    );
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('AND students.is_active = true'),
      ['school-id', 'admin-id', 'admin'],
    );
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('school_subject_grades.weekly_frequency * class_count.total'),
      ['school-id', 'admin-id', 'admin'],
    );
    expect(query.mock.calls[0]?.[0]).not.toContain('school_subjects.weekly_frequency');
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('classes_with_incomplete_schedules'),
      ['school-id', 'admin-id', 'admin'],
    );
  });

  it('returns only assigned data and omits administrative-only counts for teachers', async () => {
    const query = vi.fn(async () => ({
      rows: [{
        students: 4,
        classes: 2,
        subjects: 7,
        teachers: null,
        active_teachers: null,
        required_teachers: null,
        configured_subject_frequencies: null,
        schedules: 7,
        classes_with_incomplete_schedules: null,
        events: null,
        assessments: 5,
        behavior_records: 3,
        students_missing_responsible: null,
        active_assigned_teachers: null,
        configured_events: null,
        morning_session_periods: null,
        afternoon_session_periods: null,
        configured_students: null,
      }],
      rowCount: 1,
    }));
    const service = new DashboardService({ query } as unknown as DatabaseService);

    await expect(service.getSummary('school-id', 'teacher-id', 'teacher')).resolves.toEqual({
      students: 4,
      classes: 2,
      subjects: 7,
      teachers: null,
      activeTeachers: null,
      requiredTeachers: null,
      configuredSubjectFrequencies: null,
      schedules: 7,
      classesWithIncompleteSchedules: null,
      events: null,
      assessments: 5,
      behaviorRecords: 3,
      studentsMissingResponsible: null,
      activeAssignedTeachers: null,
      configuredEvents: null,
      morningSessionPeriods: null,
      afternoonSessionPeriods: null,
      configuredStudents: null,
    });
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('teacher_class_assignments'),
      ['school-id', 'teacher-id', 'teacher'],
    );
  });

  it('groups administrative observations by issue and omits empty categories', async () => {
    const query = vi.fn(async () => ({
      rows: [
        { type: 'classes-without-schedules', item: '4º ano · Turma A (2026)' },
        { type: 'classes-without-students', item: '3º ano · Turma B (2026)' },
        { type: 'classes-without-teachers', item: '5º ano · Turma C (2026)' },
        { type: 'subjects-without-teachers', item: 'Ciências' },
        { type: 'subjects-without-teachers', item: 'História' },
        { type: 'students-without-responsible', item: 'Estudante de teste' },
      ],
      rowCount: 6,
    }));
    const service = new DashboardService({ query } as unknown as DatabaseService);

    await expect(service.getObservations('school-id')).resolves.toEqual([
      {
        type: 'subjects-without-teachers',
        title: 'Matérias sem professor',
        href: '/materias',
        items: ['Ciências', 'História'],
      },
      {
        type: 'classes-without-students',
        title: 'Turmas sem alunos',
        href: '/turmas',
        items: ['3º ano · Turma B (2026)'],
      },
      {
        type: 'classes-without-schedules',
        title: 'Turmas sem horário definido',
        href: '/horarios',
        items: ['4º ano · Turma A (2026)'],
      },
      {
        type: 'classes-without-teachers',
        title: 'Turmas sem professor',
        href: '/professores',
        items: ['5º ano · Turma C (2026)'],
      },
      {
        type: 'students-without-responsible',
        title: 'Alunos sem responsável',
        href: '/alunos',
        items: ['Estudante de teste'],
      },
    ]);
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('teacher_subject_assignments'),
      ['school-id'],
    );
  });

  it('returns no observations when all school records are configured', async () => {
    const query = vi.fn(async () => ({ rows: [], rowCount: 0 }));
    const service = new DashboardService({ query } as unknown as DatabaseService);

    await expect(service.getObservations('school-id')).resolves.toEqual([]);
  });
});
