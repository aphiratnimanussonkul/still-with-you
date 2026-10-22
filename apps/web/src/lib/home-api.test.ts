import { describe, expect, it } from 'vitest';
import { mockEvents, mockPeople } from '@/mocks/data';
import { HOME_QUESTION_TEMPLATES, fillQuestionText, homeQuestionId } from '@/mocks/home-questions';
import { focusListResponseSchema } from '@still-with-you/contracts';
import {
  FOCUS_MAX,
  createFactSchema,
  familyFocusRequestSchema,
  familyFocusResponseSchema,
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

  it('parses GET /home as the live API { display_name, person, key } shape', () => {
    const home = familyHomeSchema.parse({
      focus: [
        {
          person: { id: mockPeople[0].id, display_name: mockPeople[0].display_name },
          photo_url: null,
          memory_count: 2,
          position: 0,
        },
      ],
      quick_question: {
        question_id: homeQuestionId(0),
        key: 'birthplace',
        person: { id: mockPeople[0].id, display_name: mockPeople[0].display_name },
        text: fillQuestionText(HOME_QUESTION_TEMPLATES[0], mockPeople[0].display_name),
      },
      recent_memories: mockEvents.filter((event) => event.status === 'active').slice(0, 5),
    });
    expect(home.quick_question?.text.includes('{ชื่อ}')).toBe(false);
    expect(home.focus[0]?.person.display_name).toBe('ยายสมศรี');
    expect(familyHomeSchema.parse({ ...home, quick_question: null }).quick_question).toBeNull();
    expect(
      familyHomeSchema.safeParse({
        focus: [{ person: { id: mockPeople[0].id, name: mockPeople[0].name }, photo_url: null, memory_count: 2 }],
        quick_question: { question_id: 'q-1', person_id: mockPeople[0].id, text: 'x' },
        recent_memories: [],
      }).success
    ).toBe(false);
  });

  it('limits PUT /focus request body to 10 uuids and keeps display order', () => {
    const ids = [mockPeople[1].id, mockPeople[0].id];
    expect(familyFocusRequestSchema.parse({ person_ids: ids }).person_ids).toEqual(ids);
    expect(
      familyFocusRequestSchema.safeParse({ person_ids: Array.from({ length: FOCUS_MAX + 1 }, () => ids[0]) }).success
    ).toBe(false);
    expect(familyFocusRequestSchema.safeParse({ person_ids: ['not-a-uuid'] }).success).toBe(false);
  });

  it('parses GET/PUT /focus contract responses as { items }', () => {
    const payload = {
      items: [
        {
          person: { id: mockPeople[1].id, display_name: mockPeople[1].name },
          photo_url: null,
          memory_count: 0,
          position: 0,
        },
        {
          person: { id: mockPeople[0].id, display_name: mockPeople[0].name },
          photo_url: 'https://cdn.example.com/yay.jpg',
          memory_count: 2,
          position: 1,
        },
      ],
    };
    expect(familyFocusResponseSchema.parse(payload)).toEqual(payload);
    expect(focusListResponseSchema.parse(payload).items.map((item) => item.person.id)).toEqual([
      mockPeople[1].id,
      mockPeople[0].id,
    ]);
    expect(familyFocusResponseSchema.safeParse({ person_ids: [mockPeople[0].id] }).success).toBe(false);
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
          question: {
            id: homeQuestionId(0),
            key: 'birthplace',
            text: 'ยายสมศรี เกิดที่ไหน',
          },
          answers: [
            {
              id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
              answer_text: 'อยุธยา',
              author: { account_id: '11111111-1111-4111-8111-111111111111', display_name: 'Atta' },
              created_at: '2026-10-22T00:00:00.000Z',
              updated_at: '2026-10-22T00:00:00.000Z',
              can_edit: true,
              can_delete: true,
            },
          ],
        },
      ],
    });
    expect(facts.groups[0]?.answers[0]?.answer_text).toBe('อยุธยา');
  });
});
