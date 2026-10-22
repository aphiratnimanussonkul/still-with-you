import { describe, expect, it } from 'vitest';
import { mockEvents, mockPeople } from '@/mocks/data';
import { HOME_QUESTION_TEMPLATES, fillQuestionText } from '@/mocks/home-questions';
import {
  FOCUS_MAX,
  createFactSchema,
  familyFocusSchema,
  familyHomeSchema,
  personFactsSchema,
  skipFactSchema,
  updateFactSchema,
} from '@/lib/home-api';

describe('home draft contract', () => {
  it('keeps twenty question fixtures and fills {ชื่อ} in the API text', () => {
    expect(HOME_QUESTION_TEMPLATES).toHaveLength(20);
    const text = fillQuestionText(HOME_QUESTION_TEMPLATES[0], 'ยายสมศรี');
    expect(text).toBe('ยายสมศรี เกิดที่ไหน');
    expect(text.includes('{ชื่อ}')).toBe(false);
  });

  it('parses GET /home: focus cards, filled question or null, and 5 recent memories', () => {
    const home = familyHomeSchema.parse({
      focus: [
        {
          person: { id: mockPeople[0].id, name: mockPeople[0].name },
          photo_url: null,
          memory_count: 2,
        },
      ],
      quick_question: {
        question_id: 'q-1',
        person_id: mockPeople[0].id,
        text: fillQuestionText(HOME_QUESTION_TEMPLATES[0], mockPeople[0].name),
      },
      recent_memories: mockEvents.filter((event) => event.status === 'active').slice(0, 5),
    });
    expect(home.quick_question?.text.includes('{ชื่อ}')).toBe(false);
    expect(home.recent_memories.length).toBeLessThanOrEqual(5);

    expect(familyHomeSchema.parse({ ...home, quick_question: null }).quick_question).toBeNull();
    expect(() =>
      familyHomeSchema.parse({
        ...home,
        recent_memories: [...mockEvents, ...mockEvents, ...mockEvents],
      })
    ).toThrow();
  });

  it('limits PUT /focus to 10 uuids and keeps display order', () => {
    const ids = [mockPeople[1].id, mockPeople[0].id];
    expect(familyFocusSchema.parse({ person_ids: ids }).person_ids).toEqual(ids);
    expect(familyFocusSchema.safeParse({ person_ids: Array.from({ length: FOCUS_MAX + 1 }, () => ids[0]) }).success).toBe(
      false
    );
    expect(familyFocusSchema.safeParse({ person_ids: ['not-a-uuid'] }).success).toBe(false);
  });

  it('requires an answer on POST /facts and a question_id on skip', () => {
    expect(createFactSchema.safeParse({ question_id: 'q-1', answer_text: 'อยุธยา' }).success).toBe(true);
    expect(createFactSchema.safeParse({ question_id: 'q-1', answer_text: '   ' }).success).toBe(false);
    expect(createFactSchema.safeParse({ question_id: 'q-1' }).success).toBe(false);
    expect(skipFactSchema.safeParse({ question_id: 'q-1' }).success).toBe(true);
    expect(skipFactSchema.safeParse({}).success).toBe(false);
    expect(updateFactSchema.safeParse({ answer_text: 'อยุธยา' }).success).toBe(true);
    expect(updateFactSchema.safeParse({ answer_text: '   ' }).success).toBe(false);
  });

  it('parses GET /people/{id}/facts as grouped answers', () => {
    const facts = personFactsSchema.parse({
      groups: [
        {
          question: { id: 'q-1', text: 'ยายสมศรี เกิดที่ไหน' },
          answers: [
            {
              id: 'fact-1',
              answer_text: 'อยุธยา',
              author: { account_id: '11111111-1111-4111-8111-111111111111', display_name: 'Atta' },
              created_at: '2026-10-22T00:00:00.000Z',
            },
          ],
        },
      ],
    });
    expect(facts.groups[0]?.answers[0]?.answer_text).toBe('อยุธยา');
  });
});
