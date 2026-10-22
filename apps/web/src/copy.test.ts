import { describe, expect, it } from 'vitest';
import { copy, familyItemMeta, interpolate, interpolateHeading, truncateName } from '@/copy';

describe('copy v0.4', () => {
  it('has no remaining TODO placeholders except draft people-CRUD keys', () => {
    const leftovers = Object.entries(copy)
      .filter(([, value]) => value.startsWith('TODO:'))
      .map(([key]) => key);
    expect(leftovers).toEqual([
      'person.family_name.label',
      'person.gender.label',
      'person.birth.label',
      'person.bio.label',
      'person.avatar.label',
      'person.relationship.label',
      'person.relationship.related',
      'person.invite.share',
      'person.edit.title',
      'person.edit.action',
      'person.delete.action',
      'person.delete.confirm.primary',
    ]);
  });

  it('uses Eddy draft people-CRUD copy', () => {
    expect(copy['person.display_name.label']).toBe('ชื่อ');
    expect(copy['person.birth.hint']).toBe('ใส่วันเกิดแล้วจะแสดงอายุให้เอง');
    expect(copy['person.age']).toBe('อายุ {age} ปี');
    expect(copy['person.invite.action']).toBe('ชวน {name} เข้าครอบครัว');
    expect(copy['person.delete.confirm.title']).toBe('ลบ {name} ออกจากผังไหม');
    expect(copy['person.delete.confirm.body']).toBe(
      '{name} จะหายไปจากผังพร้อมคำตอบเรื่องที่รู้เกี่ยวกับ{name} และกู้คืนไม่ได้ ส่วนความทรงจำและเรื่องเล่าที่มี {name} จะยังอยู่'
    );
    expect(copy['person.delete.linked']).toBe(
      '{name} เป็นสมาชิกครอบครัวแล้ว ถ้าจะลบออกจากผัง ต้องเอาออกจากสมาชิกก่อน'
    );
    expect(copy['person.unjoined']).toBe('ยังไม่ได้เข้าร่วม');
    expect(copy['person.gender.male']).toBe('ชาย');
    expect(copy['person.gender.female']).toBe('หญิง');
    expect(copy['person.gender.unspecified']).toBe('ไม่ระบุ');
    expect(copy['person.relationship.parent']).toBe('เป็นพ่อแม่ของ');
    expect(copy['person.relationship.spouse']).toBe('เป็นคู่ของ');
    expect(copy['relation.type.child']).toBe('เป็นลูกของ');
    expect(copy['person.status.uninvited']).toBe('ยังไม่ได้เชิญ');
    expect(copy['person.status.pending']).toBe('รอตอบรับคำเชิญ');
    expect(copy['person.status.linked']).toBe('เป็นสมาชิกแล้ว');
    expect(copy['person.age.approx']).toBe('อายุประมาณ {age} ปี');
    expect(copy['person.birth.mode.year']).toBe('รู้แค่ปีเกิด');
    expect(copy['error.INVALID_RELATIONSHIP']).toBe(
      'ความสัมพันธ์นี้ใช้ไม่ได้ในผัง ลองเลือกคนหรือความสัมพันธ์ใหม่'
    );
    expect(copy['error.RELATIONSHIP_EXISTS']).toBe('มีความสัมพันธ์นี้ในผังอยู่แล้ว');
    expect(copy['person.unsaved.title']).toBe('ทิ้งข้อมูลที่กรอกไว้ไหม');
    expect(copy['person.unsaved.body']).toBe('ถ้าออกตอนนี้ ข้อมูลที่กรอกไว้จะหายไป');
    expect(copy['person.unsaved.leave']).toBe('ทิ้งข้อมูล');
    expect(copy['person.unsaved.stay']).toBe('กรอกต่อ');
    expect(copy['error.NAME_REQUIRED']).toBe('ใส่ชื่อก่อนบันทึก');
    expect(copy['person.relation_label.label']).toBe('ชื่อที่ครอบครัวเรียก (ไม่บังคับ)');
    expect(copy['person.relation_label.placeholder']).toBe('เช่น ยาย ลุงหนึ่ง');
    expect(copy['person.bio.counter']).toBe('{count}/2000');
    expect(copy['error.INVALID_BIRTH_DATE']).toBe('วันเกิดต้องไม่เกินวันนี้');
    expect(copy['error.PERSON_LINKED']).toBe(
      'ลบ {name} ไม่ได้ เพราะ {name} เป็นสมาชิกครอบครัวแล้ว ต้องเอาออกจากสมาชิกก่อน'
    );
    expect(copy['error.PERSON_ALREADY_LINKED']).toBe(
      '{name} ในผังนี้ผูกกับบัญชีอื่นไปแล้ว ขอคำเชิญใหม่จากผู้ดูแลครอบครัว'
    );
    expect(copy['error.INVITE_INVALID']).toBe('คำเชิญนี้ใช้ไม่ได้แล้ว ขอคำเชิญใหม่จากผู้ดูแลครอบครัว');
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
    expect(copy['error.generic']).toBe('มีบางอย่างผิดพลาด ลองใหม่อีกครั้ง');
    expect(copy['error.ANSWER_REQUIRED']).toBe('พิมพ์คำตอบสักนิดก่อนบันทึก');
    expect(copy['error.TOO_MANY_FOCUS']).toBe('เลือกได้สูงสุด 10 คน เอาบางคนออกก่อนแล้วค่อยเพิ่ม');
    expect(copy['error.ALREADY_ANSWERED']).toBe('คุณเคยตอบคำถามนี้แล้ว แก้คำตอบเดิมได้เลย');
    expect(copy['home.question.already_answered.action']).toBe('แก้คำตอบเดิม');
    expect(copy['home.question.saved.toast']).toBe('บันทึกคำตอบแล้ว');
    expect(copy['home.question.skipped.toast']).toBe('ข้ามไปก่อน คำถามนี้จะกลับมาอีกในภายหลัง');
    expect(copy['memory.stories.load_error']).toBe('โหลดเรื่องเล่าไม่สำเร็จ ลองใหม่อีกครั้ง');
    expect(copy['memory.stories.retry']).toBe('ลองอีกครั้ง');
    expect(copy['home.focus.invite.title']).toBe('อยากระลึกถึงใครเป็นพิเศษ');
    expect(copy['home.focus.invite.body']).toBe(
      'เลือกคนในครอบครัวมาไว้บนหน้านี้ แล้วจะมีคำถามเล็กๆ ช่วยให้รู้จักเขามากขึ้น เห็นเฉพาะคุณ'
    );
    expect(copy['home.focus.invite.action']).toBe('เลือกคน');
    expect(copy['person.facts.title']).toBe('เรื่องที่รู้เกี่ยวกับ{name}');
    expect(copy['person.facts.empty.title']).toBe('ยังไม่มีใครเล่าเรื่องเกี่ยวกับ{name}');
    expect(copy['person.facts.empty.body']).toBe(
      'คำตอบจากคำถามเล็กๆ ของทุกคนในครอบครัวจะมาอยู่ที่นี่'
    );
    expect(copy['person.facts.answer.meta']).toBe('ตอบโดย {ผู้ตอบ} · {วันที่}');
  });

  it('uses specified photo-limit copy with placeholders', () => {
    expect(copy['error.FILE_TOO_LARGE']).toBe('รูปนี้ใหญ่เกิน {max_mb}MB ลองเลือกรูปอื่น');
    expect(copy['error.TOO_MANY_PHOTOS']).toBe('เพิ่มรูปได้สูงสุด {max} รูปต่อเรื่องเล่า');
    expect(copy['error.UNSUPPORTED_TYPE']).toBe('ใช้ไฟล์นี้ไม่ได้ เลือกรูปแบบ JPEG, PNG, HEIC หรือ WebP');
    expect(copy['error.UPLOAD_MISMATCH']).toBe('อัปโหลดรูปนี้ไม่สำเร็จ ลองเลือกรูปนี้อีกครั้ง');
    expect(copy['error.MEDIA_NOT_READY']).toBe('รูปบางรูปยังอัปโหลดไม่เสร็จ รอสักครู่แล้วบันทึกอีกครั้ง');
    expect(copy['photo.count']).toBe('{n}/{max} รูป');
    expect(copy['photo.upload.wait']).toBe('รอรูปอัปโหลดให้เสร็จก่อน จึงจะบันทึกได้');
    expect(copy['photo.label']).toBe('เพิ่มรูป (ถ้ามี)');
  });

  it('includes the four IA tab labels from Eddy', () => {
    expect(copy['nav.home']).toBe('หน้าแรก');
    expect(copy['nav.memories']).toBe('ความทรงจำ');
    expect(copy['nav.family']).toBe('ครอบครัว');
    expect(copy['nav.me']).toBe('ฉัน');
    expect(copy['family.switcher']).toBe('เปลี่ยนครอบครัว');
    expect(copy['a11y.family_switcher']).toBe('ครอบครัวที่เลือกอยู่: {ชื่อครอบครัว}');
    expect(copy['trash.item.active.meta.family']).toBe('ย้ายมาจาก {ชื่อความทรงจำ} · {ชื่อครอบครัว}');
    expect(copy['home.focus.title']).toBe('คนที่คุณอยากระลึกถึง');
    expect(copy['home.focus.see_all']).toBe('ดูทั้งหมด');
    expect(copy['home.question.title']).toBe('คำถามเล็กๆ สำหรับคุณ');
    expect(copy['home.question.save']).toBe('บันทึกคำตอบ');
    expect(copy['home.question.skip']).toBe('ข้ามคำถามนี้');
    expect(copy['family.focus.toggle']).toBe('แสดงบนหน้าแรก');
    expect(copy['family.focus.note']).toBe('เห็นเฉพาะคุณ');
    expect(copy['family.focus.load_error']).toBe('โหลดรายชื่อบนหน้าแรกไม่สำเร็จ');
    expect(copy['family.focus.load_error.action']).toBe('ลองอีกครั้ง');
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
