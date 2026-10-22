/**
 * Stand-in MSW question bank. The attached 20-question file was not in this
 * workspace — replace these texts with that list. Each `text` is the API
 * shape: {ชื่อ} already substituted for the focused person.
 */
export const HOME_QUESTION_TEMPLATES = [
  '{ชื่อ} เกิดที่ไหน',
  '{ชื่อ} มีชื่อเล่นว่าอะไร',
  '{ชื่อ} ชอบกินอะไรเป็นพิเศษ',
  '{ชื่อ} ทำอาหารจานไหนเก่งที่สุด',
  '{ชื่อ} ชอบไปเที่ยวที่ไหน',
  '{ชื่อ} ทำงานอะไรเมื่อก่อน',
  '{ชื่อ} รู้จักคู่ชีวิตได้อย่างไร',
  '{ชื่อ} มีลูกกี่คน',
  '{ชื่อ} สอนอะไรที่ยังจำได้',
  '{ชื่อ} ชอบฟังเพลงแบบไหน',
  '{ชื่อ} กลัวอะไรที่สุด',
  '{ชื่อ} หัวเราะเรื่องอะไรบ่อย',
  '{ชื่อ} เก็บของอะไรไว้เป็นพิเศษ',
  '{ชื่อ} ชอบเทศกาลไหน',
  '{ชื่อ} เล่าเรื่องเด็ก ๆ เรื่องไหนบ่อย',
  '{ชื่อ} ใส่ชุดแบบไหนแล้วดูเป็นตัวเอง',
  '{ชื่อ} ชอบดอกไม้อะไร',
  '{ชื่อ} ปลอบใครอย่างไรตอนเสียใจ',
  '{ชื่อ} อยากให้จำอะไรเกี่ยวกับตัวเอง',
  '{ชื่อ} มีคำพูดติดปากว่าอะไร',
] as const;

export function fillQuestionText(template: string, name: string): string {
  return template.replace(/\{ชื่อ\}/g, name);
}

export function homeQuestionId(index: number): string {
  return `aaaaaaaa-aaaa-4aaa-8aaa-${String(index + 1).padStart(12, '0')}`;
}
