import { describe, expect, it } from 'vitest';
import { copy, familyItemMeta, interpolate, interpolateHeading, truncateName } from '@/copy';

describe('copy v0.4', () => {
  it('has no remaining TODO placeholders', () => {
    const leftovers = Object.entries(copy)
      .filter(([, value]) => value.startsWith('TODO:'))
      .map(([key]) => key);
    expect(leftovers).toEqual([]);
  });

  it('uses locked v0.4 wording for create, tree, cancel, and admin confirm split', () => {
    expect(copy['family.create.submit']).toBe('สร้างครอบครัว');
    expect(copy['family.tab.tree']).toBe('แผนผังครอบครัว');
    expect(copy['common.cancel']).toBe('ยกเลิก');
    expect(copy['members.action.remove_admin']).toBe('ถอดบทบาทผู้ดูแล');
    expect(copy['members.make_admin.confirm.title']).toBe('ตั้ง {ชื่อ} เป็นผู้ดูแลใช่ไหม');
    expect(copy['members.make_admin.confirm.body']).toBe(
      'ผู้ดูแลชวนสมาชิกใหม่ แก้ข้อมูลหลักของความทรงจำ และพักไว้หรือลบความทรงจำได้ แต่แก้หรือลบเรื่องเล่าของคนอื่นไม่ได้'
    );
    expect(copy['LAST_ADMIN.action']).toBe('ตั้งคนอื่นเป็นผู้ดูแล');
    expect(copy['error.network']).toBe('ยังเชื่อมต่อไม่ได้ ลองตรวจอินเทอร์เน็ต แล้วลองใหม่');
    expect(copy['error.unknown']).toBe('มีบางอย่างผิดพลาด ลองใหม่อีกครั้ง');
  });

  it('includes Eddy aria-label keys for icon-only controls', () => {
    expect(copy['a11y.back']).toBe('ย้อนกลับ');
    expect(copy['a11y.more']).toBe('ตัวเลือกเพิ่มเติม');
    expect(copy['a11y.close']).toBe('ปิด');
    expect(copy['a11y.clear_search']).toBe('ล้างคำค้น');
    expect(copy['a11y.add_photo']).toBe('เพิ่มรูป');
    expect(copy['a11y.remove_photo']).toBe('เอารูปนี้ออก');
    expect(copy['a11y.member_more']).toBe('ตัวเลือกของ {ชื่อ}');
    expect(copy['a11y.memory_more']).toBe('ตัวเลือกของความทรงจำ {ชื่อความทรงจำ}');
  });

  it('truncates long names in interpolate for list titles, meta, and toasts', () => {
    expect(truncateName('สั้น')).toBe('สั้น');
    expect(truncateName('ชื่อที่ยาวเกินยี่สิบตัวอักษรแน่นอน')).toBe('ชื่อที่ยาวเกินยี่สิ…');
    expect(
      interpolate(copy['family.create.success'], { ชื่อครอบครัว: 'ชื่อที่ยาวเกินยี่สิบตัวอักษรแน่นอน' })
    ).toBe('เริ่มครอบครัว ชื่อที่ยาวเกินยี่สิ… แล้ว');
    expect(interpolate(copy['family.create.success'], { ชื่อครอบครัว: 'บ้านเรา' })).toBe(
      'เริ่มครอบครัว บ้านเรา แล้ว'
    );
  });

  it('keeps the full name in page headings', () => {
    expect(
      interpolateHeading(copy['welcome.title'], { ชื่อ: 'Aphirat Nimanussonkul' })
    ).toBe('ยินดีต้อนรับ Aphirat Nimanussonkul');
    expect(
      interpolateHeading(copy['memory.delete.confirm.title'], {
        ชื่อความทรงจำ: 'ทริปหัวหินปี 2539 กับครอบครัวทั้งหมด',
      })
    ).toBe('ลบ "ทริปหัวหินปี 2539 กับครอบครัวทั้งหมด" ถาวรใช่ไหม');
  });

  it('hides the family list role unless the viewer is an admin', () => {
    expect(familyItemMeta(3, true)).toBe('3 คน · ผู้ดูแล');
    expect(familyItemMeta(3, false)).toBe('3 คน');
  });
});
