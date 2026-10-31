import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  copy,
  type CopyKey,
  familyItemMeta,
  homeFocusCardMeta,
  interpolate,
  interpolateHeading,
  ownerDisplayName,
  optionalBadgeText,
  optionalFieldLabel,
  personRelationLabel,
  storyCounter,
  storyToldAt,
  truncateName,
} from '@/copy';

describe('copy v0.4', () => {
  it('has no remaining TODO placeholders', () => {
    const leftovers = Object.entries(copy)
      .filter(([, value]) => value.startsWith('TODO:'))
      .map(([key]) => key);
    expect(leftovers).toEqual([]);
  });

  it('has Thai copy for every key used on person profile and edit', () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const files = [
      'pages/PersonFormPage.tsx',
      'pages/PersonPage.tsx',
      'components/PersonPhotoField.tsx',
      'components/PersonProfileMenu.tsx',
    ];
    const used = new Set<string>();
    for (const file of files) {
      const src = readFileSync(resolve(here, file), 'utf8');
      for (const match of src.matchAll(/copy\['([^']+)'\]/g)) {
        used.add(match[1]);
      }
    }
    const missing: string[] = [];
    const raw: string[] = [];
    for (const key of used) {
      const value = copy[key as CopyKey];
      if (value == null) missing.push(key);
      else if (value.startsWith('TODO:') || value === key) raw.push(key);
    }
    expect({ missing, raw }).toEqual({ missing: [], raw: [] });
  });

  it('uses Eddy draft people-CRUD copy', () => {
    expect(copy['person.display_name.label']).toBe('ชื่อ');
    expect(copy['person.birth.hint']).toBe('ใส่วันเกิดแล้วจะแสดงอายุให้เอง');
    expect(copy['person.age']).toBe('อายุ {age} ปี');
    expect(copy['person.age.exact']).toBe('อายุ {n} ปี');
    expect(copy['person.invite.action']).toBe('ชวน {name} เข้าครอบครัว');
    expect(copy['person.menu.edit']).toBe('แก้ข้อมูล');
    expect(copy['person.edit.action']).toBe('แก้ข้อมูล');
    expect(copy['person.edit.photo.change']).toBe('เปลี่ยนรูป');
    expect(copy['person.edit.photo.remove']).toBe('เอารูปออก');
    expect(copy['person.avatar.label']).toBe('รูปโปรไฟล์ (ไม่บังคับ)');
    expect(copy['person.bio.label']).toBe('ข้อมูลส่วนตัว (ไม่บังคับ)');
    expect(copy['person.family_name.label']).toBe('นามสกุล (ไม่บังคับ)');
    expect(copy['person.gender.label']).toBe('เพศ (ไม่บังคับ)');
    expect(copy['person.birth.label']).toBe('วันเกิด (ไม่บังคับ)');
    expect(copy['person.relationship.label']).toBe('ความสัมพันธ์ในผัง (ไม่บังคับ)');
    expect(copy['person.relationship.related']).toBe('คนที่เกี่ยวข้อง');
    expect(copy['person.invite.share']).toBe('ส่งลิงก์ชวน');
    expect(copy['tree.readonly.note']).toBe(
      'ผู้ดูแลครอบครัวเป็นคนจัดผัง ถ้าเห็นอะไรไม่ตรง ลองบอกผู้ดูแลดู'
    );
    expect(copy['person.edit.title']).toBe('แก้ข้อมูลของ{name}');
    expect(copy['person.edit.relation_note']).toBe(
      'ถ้าอยากแก้ความสัมพันธ์ ไปแก้ที่หน้าผังครอบครัวได้เลย'
    );
    expect(copy['person.edit.save_failed']).toBe(
      'ขอโทษด้วย ตอนนี้ยังบันทึกไม่ได้ ที่แก้ไว้ยังอยู่ครบ ลองอีกครั้งได้เลย'
    );
    expect(copy['person.edit.media_not_ready']).toBe('รูปยังส่งไม่เสร็จ รอแป๊บ แล้วจึงบันทึกอีกที');
    expect(copy['person.edit.forbidden.title']).toBe('ตอนนี้แก้ข้อมูลไม่ได้');
    expect(copy['person.edit.forbidden']).toBe('ตอนนี้มีแค่ผู้ดูแลครอบครัวที่แก้ข้อมูลคนในผังได้');
    expect(copy['person.error.ok']).toBe('เข้าใจแล้ว');
    expect(copy['person.delete.action']).toBe('ลบออกจากผัง');
    expect(copy['person.delete.confirm.title']).toBe('ลบ{name}ออกจากผังไหม');
    expect(copy['person.delete.confirm.body']).toBe(
      '{name}จะหายไปจากผังพร้อมคำตอบเรื่องที่รู้เกี่ยวกับ{name} และกู้คืนไม่ได้ ส่วนความทรงจำและเรื่องเล่าที่มี{name}จะยังอยู่'
    );
    expect(copy['person.delete.confirm.memories']).toBe(
      'ชื่อ{ชื่อ}ในความทรงจำที่เล่าไว้แล้วยังอยู่เหมือนเดิม'
    );
    expect(copy['person.delete.confirm.primary']).toBe('ลบออกจากผัง');
    expect(copy['person.delete.confirm.secondary']).toBe('ยังไม่ลบ');
    expect(interpolate(copy['person.edit.title'], { name: 'ยายสมศรี' })).toBe('แก้ข้อมูลของยายสมศรี');
    expect(interpolate(copy['person.delete.confirm.title'], { name: 'ยายสมศรี' })).toBe(
      'ลบยายสมศรีออกจากผังไหม'
    );
    expect(interpolateHeading(copy['person.delete.confirm.memories'], { ชื่อ: 'ยายสมศรี' })).toBe(
      'ชื่อยายสมศรีในความทรงจำที่เล่าไว้แล้วยังอยู่เหมือนเดิม'
    );
    expect(copy['person.delete.linked.title']).toBe('ลบออกจากผังไม่ได้');
    expect(copy['person.delete.linked']).toBe('{ชื่อ}เข้ามาเป็นสมาชิกแล้ว เลยลบออกจากผังไม่ได้');
    expect(interpolateHeading(copy['person.delete.linked'], { ชื่อ: 'ยายสมศรี' })).toBe(
      'ยายสมศรีเข้ามาเป็นสมาชิกแล้ว เลยลบออกจากผังไม่ได้'
    );
    expect(copy['person.unjoined']).toBe('ยังไม่ได้เข้าร่วม');
    expect(copy['person.gender.male']).toBe('ชาย');
    expect(copy['person.gender.female']).toBe('หญิง');
    expect(copy['person.gender.other']).toBe('อื่นๆ');
    expect(copy['person.gender.unspecified']).toBe('ไม่ระบุ');
    expect(copy['person.relationship.parent']).toBe('เป็นพ่อแม่ของ');
    expect(copy['person.relationship.spouse']).toBe('เป็นคู่ของ');
    expect(copy['relation.type.child']).toBe('เป็นลูกของ');
    expect(copy['person.status.uninvited']).toBe('ยังไม่ได้เชิญ');
    expect(copy['person.status.pending']).toBe('รอตอบรับคำเชิญ');
    expect(copy['person.status.linked']).toBe('เป็นสมาชิกแล้ว');
    expect(copy['person.invite.status.none']).toBe('ยังไม่ได้ชวน');
    expect(copy['person.age.approx']).toBe('อายุประมาณ {n} ปี');
    expect(copy['person.birth.mode.year']).toBe('รู้แค่ปีเกิด');
    expect(copy['error.INVALID_RELATIONSHIP']).toBe(
      'ความสัมพันธ์นี้ใช้ไม่ได้ในผัง ลองเลือกคนหรือความสัมพันธ์ใหม่'
    );
    expect(copy['error.RELATIONSHIP_EXISTS']).toBe('มีความสัมพันธ์นี้ในผังอยู่แล้ว');
    expect(copy['person.unsaved.title']).toBe('ทิ้งข้อมูลที่กรอกไว้ไหม');
    expect(copy['person.unsaved.body']).toBe('ถ้าออกตอนนี้ ข้อมูลที่กรอกไว้จะหายไป');
    expect(copy['person.unsaved.leave']).toBe('ทิ้งข้อมูล');
    expect(copy['person.unsaved.stay']).toBe('กรอกต่อ');
    expect(copy['person.add.discard.title']).toBe('ข้อมูลที่กรอกไว้ยังไม่ได้บันทึกเลย');
    expect(copy['person.add.discard.body']).toBe('ถ้าออกไปก่อน ข้อมูลที่กรอกไว้จะหายไป');
    expect(copy['person.add.discard.keep']).toBe('กรอกต่อ');
    expect(copy['person.add.discard.leave']).toBe('ออกโดยไม่บันทึก');
    expect(copy['person.add.photo.label']).toBe('รูปโปรไฟล์ (ไม่บังคับ)');
    expect(copy['person.add.photo.cta']).toBe('เพิ่มรูป');
    expect(copy['person.name.label']).toBe('ชื่อ');
    expect(copy['person.name.placeholder']).toBe('เช่น สมศรี');
    expect(copy['person.name.required']).toBe('ใส่ชื่อก่อนนะ ชื่อที่ทุกคนเรียกก็ได้');
    expect(copy['person.relation.label']).toBe('เป็นอะไรกับ {name} (ไม่บังคับ)');
    expect(personRelationLabel(null)).toBe('เป็นอะไรกับคุณ (ไม่บังคับ)');
    expect(personRelationLabel('ยายสมศรี')).toBe('เป็นอะไรกับ ยายสมศรี (ไม่บังคับ)');
    expect(copy['person.relation.is']).toBe('เป็น');
    expect(copy['person.relation.of']).toBe('ของ');
    expect(copy['person.relation.type.placeholder']).toBe('เลือกความสัมพันธ์');
    expect(copy['person.living.label']).toBe('ยังมีชีวิตอยู่');
    expect(copy['person.add.saved_toast']).toBe('เพิ่ม {name} ในผังแล้ว');
    expect(copy['person.events.empty']).toBe('ยังไม่มีใครเล่าเรื่องที่มี{name}');
    expect(copy['common.retry']).toBe('ลองอีกครั้ง');
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
    expect(copy['invite.landing.title']).toBe(
      '{inviter_display_name} ชวนคุณเข้าครอบครัว {family_name}'
    );
    expect(copy['invite.landing.body']).toBe(
      'ในผังครอบครัวมีหน้าของ {person_display_name} อยู่แล้ว รับคำเชิญแล้วหน้านี้จะผูกกับบัญชีของคุณ'
    );
    expect(copy['invite.family.body']).toBe(
      'รับคำเชิญแล้วคุณจะเห็นความทรงจำและเรื่องเล่าของครอบครัวนี้ และเล่าเรื่องของคุณได้ด้วย'
    );
    expect(copy['invite.landing.accept']).toBe('รับคำเชิญ');
    expect(copy['invite.landing.login']).toBe('เข้าสู่ระบบเพื่อรับคำเชิญ');
    expect(copy['invite.landing.expires']).toBe('คำเชิญนี้ใช้ได้ถึง {date}');
    expect(copy['invite.accepted.toast']).toBe('ยินดีต้อนรับสู่ครอบครัว {family_name}');
    expect(copy['person.invite.note']).toBe('ลิงก์นี้ใช้ได้ครั้งเดียว ภายใน 7 วัน');
    expect(copy['invite.copied.toast']).toBe('คัดลอกลิงก์แล้ว');
    expect(copy['invite.revoke.confirm.body']).toBe(
      'ลิงก์ที่ส่งไปแล้วจะใช้ไม่ได้ ถ้าต้องการชวนอีกครั้งต้องสร้างลิงก์ใหม่'
    );
    expect(copy['person.memories.with_name']).toBe('ความทรงจำที่มี {name}');
    expect(copy['person.memories.empty']).toBe('ยังไม่มีความทรงจำที่มี {name}');
    expect(copy['person.events.empty']).toBe('ยังไม่มีใครเล่าเรื่องที่มี{name}');
    expect(copy['error.RATE_LIMITED.invite']).toBe('ลองหลายครั้งเกินไป รอสักครู่แล้วลองอีกครั้ง');
  });

  it('uses Eddy contribution-photo copy', () => {
    expect(copy['contribution.photos.label']).toBe('รูปภาพ (ไม่บังคับ)');
    expect(copy['contribution.photo.alt']).toBe('รูปที่ {ชื่อผู้เล่า} แนบไว้ {i} จาก {n}');
    expect(copy['contribution.photos.viewer.counter']).toBe('{i}/{n}');
    expect(copy['photo.load_error']).toBe('โหลดรูปนี้ไม่ได้');
    expect(copy['contribution.photos.more']).toBe('ดูรูปอีก {n} รูป');
  });

  it('uses Eddy notification bodies exactly', () => {
    expect(copy['notification.contribution_added']).toBe('{actor_display_name} เล่าเรื่องใน {event_title}');
    expect(copy['notification.contribution_added.hidden']).toBe(
      '{actor_display_name} เล่าเรื่องในความทรงจำที่ตอนนี้พักไว้อยู่'
    );
    expect(copy['notification.invite_accepted']).toBe(
      '{actor_display_name} รับคำเชิญและเข้าร่วม {family_name} แล้ว'
    );
    expect(copy['notification.list.title']).toBe('การแจ้งเตือน');
    expect(copy['notification.empty.title']).toBe('ยังไม่มีอะไรใหม่');
    expect(copy['notification.empty.body']).toBe(
      'ถ้ามีใครมาเล่าเรื่องในความทรงจำของคุณ จะบอกที่นี่'
    );
    expect(copy['notification.load_more']).toBe('ดูเพิ่ม');
    expect(copy['a11y.notification.unread']).toBe('ยังไม่ได้อ่าน');
    expect(copy['notifications.list.title']).toBe(copy['notification.list.title']);
    expect(copy['error.generic.body']).toBe(
      'ขอโทษด้วย ตอนนี้ยังเปิดหน้านี้ไม่ได้ เรื่องเล่าทั้งหมดยังอยู่ครบ ลองอีกครั้งได้เลย'
    );
    expect(copy['common.back_home']).toBe('กลับหน้าแรก');
    expect(copy['common.retry']).toBe('ลองอีกครั้ง');
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
    expect(copy['family.tab.graph']).toBe('ผัง');
    expect(copy['family.tab.list']).toBe('รายชื่อ');
    expect(copy['person.add.submit']).toBe('เพิ่มในผัง');
    expect(copy['person.nickname.label']).toBe('ชื่อเรียก (ไม่บังคับ)');
    expect(copy['person.nickname.placeholder']).toBe('เช่น ยาย ลุงหนึ่ง');
    expect(copy['person.living']).toBe('ยังมีชีวิตอยู่');
    expect(copy['person.relationship.of_you']).toBe('เป็นอะไรกับคุณ');
    expect(copy['person.relationship.of_name']).toBe('เป็นอะไรกับ {ชื่อ}');
    expect(copy['person.relationship.parent']).toBe('เป็นพ่อแม่ของ');
    expect(copy['person.relationship.child']).toBe('เป็นลูกของ');
    expect(copy['person.relationship.spouse']).toBe('เป็นคู่ของ');
    expect(copy['tree.back_to_me']).toBe('กลับมาที่ฉัน');
    expect(copy['tree.fallback_list.title']).toBe('แสดงเป็นรายชื่อแทน');
    expect(copy['tree.fallback_list.body']).toBe(
      'ตอนนี้ยังเปิดผังครอบครัวไม่ได้ เลยแสดงเป็นรายชื่อให้ก่อน'
    );
    expect(copy['tree.node.add_parent']).toBe('เพิ่มพ่อแม่');
    expect(copy['relation.pick.title.spouse']).toBe('ใครเป็นคู่ชีวิตของ{ชื่อ}');
    expect(copy['relation.pick.title.parent']).toBe('ใครเป็นพ่อหรือแม่ของ{ชื่อ}');
    expect(copy['relation.pick.title.child']).toBe('ใครเป็นลูกของ{ชื่อ}');
    expect(copy['relation.pick.subtitle']).toBe(
      'เลือกจากคนที่อยู่ในผังแล้ว หรือเพิ่มคนใหม่ก็ได้'
    );
    expect(copy['relation.pick.search.placeholder']).toBe('หาชื่อ');
    expect(copy['relation.pick.section.existing']).toBe('คนในผัง');
    expect(copy['relation.pick.add_new']).toBe('เพิ่มคนใหม่');
    expect(copy['relation.pick.add_new.caption']).toBe('คนที่ยังไม่อยู่ในผัง');
    expect(copy['relation.pick.search.empty']).toBe('หา{คำค้น}ในผังไม่เจอ');
    expect(copy['relation.pick.search.add']).toBe('เพิ่ม{คำค้น}เป็นคนใหม่');
    expect(copy['relation.pick.empty']).toBe('ยังไม่มีคนอื่นในผังที่เลือกได้');
    expect(copy['relation.pick.link']).toBe('เชื่อมในผัง');
    expect(copy['relation.link.toast']).toBe('{ชื่อ}กับ{อีกคน}เชื่อมกันในผังแล้ว');
    expect(copy['relation.link.error.inline']).toBe('ขอโทษด้วย ตอนนี้ยังเชื่อมไม่ได้');
    expect(copy['relation.link.error.person_gone']).toBe('หา{ชื่อ}ในผังไม่เจอแล้ว');
    expect(copy['relation.link.error.too_many_parents']).toBe(
      '{ชื่อ}มีพ่อแม่ในผังครบสองคนแล้ว ถ้าอยากเปลี่ยน เอาคนเดิมออกก่อน แล้วจึงเพิ่มใหม่'
    );
    expect(copy['relation.link.saving']).toBe('กำลังเชื่อม…');
    expect(copy['error.INVALID_DEATH_DATE']).toBe(
      'วันที่จากไปต้องไม่ก่อนวันเกิด และไม่เกินวันนี้'
    );
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
    expect(copy['home.greeting']).toBe('สวัสดี {ชื่อ}');
    expect(copy['home.recent.title']).toBe('ความทรงจำล่าสุด');
    expect(copy['home.focus.card.meta']).toBe('{จำนวน} ความทรงจำ');
    expect(copy['home.focus.card.meta.empty']).toBe('ยังไม่มีความทรงจำ');
    expect(copy['home.question.title']).toBe('คำถามเล็กๆ สำหรับคุณ');
    expect(copy['home.question.save']).toBe('บันทึกคำตอบ');
    expect(copy['home.question.skip']).toBe('ข้ามคำถามนี้');
    expect(copy['family.focus.toggle']).toBe('แสดงบนหน้าแรก');
    expect(copy['family.focus.note']).toBe('เห็นเฉพาะคุณ');
    expect(copy['family.focus.load_error']).toBe('โหลดรายชื่อบนหน้าแรกไม่สำเร็จ');
    expect(copy['family.focus.load_error.action']).toBe('ลองอีกครั้ง');
  });

  it('uses Eddy PWA update copy', () => {
    expect(copy['app.update.body']).toBe('มีเวอร์ชันใหม่แล้ว เปิดใหม่อีกทีเพื่อใช้ต่อได้เลย');
    expect(copy['app.update.action']).toBe('เปิดใหม่');
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

  it('uses empty focus-card meta when the memory count is 0', () => {
    expect(homeFocusCardMeta(0)).toBe('ยังไม่มีความทรงจำ');
    expect(homeFocusCardMeta(1)).toBe('1 ความทรงจำ');
    expect(homeFocusCardMeta(12)).toBe('12 ความทรงจำ');
    expect(homeFocusCardMeta(0)).not.toContain('(');
    expect(homeFocusCardMeta(2)).not.toContain('(');
  });

  it('uses Eddy create-memory date, people, and optional copy', () => {
    expect(copy['memory.date.year']).toBe('ปี พ.ศ.');
    expect(copy['memory.date.month']).toBe('เดือน');
    expect(copy['memory.date.day']).toBe('วัน');
    expect(copy['memory.people.done']).toBe('เสร็จแล้ว');
    expect(copy['memory.people.edit']).toBe('แก้รายชื่อ');
    expect(copy['memory.people.search.empty']).toBe('ยังไม่มีชื่อนี้ในครอบครัว');
    expect(copy['memory.people.search.add']).toBe('เพิ่ม "{name}" เป็นคนใหม่');
    expect(copy['memory.people.search.add_empty']).toBe('เพิ่มคนใหม่');
    expect(copy['common.optional']).toBe('(ไม่บังคับ)');
    expect(optionalFieldLabel(copy['memory.date_label'])).toBe('เกิดขึ้นเมื่อไร (ไม่บังคับ)');
    expect(optionalFieldLabel(copy['memory.people_label'])).toBe('ใครอยู่ในความทรงจำนี้ (ไม่บังคับ)');
    expect(optionalBadgeText()).toBe('ไม่บังคับ');
    expect(interpolate(copy['memory.people.search.add'], { name: 'ป้าแดง' })).toBe(
      'เพิ่ม "ป้าแดง" เป็นคนใหม่'
    );
  });

  it('uses Eddy story counter and told-at copy', () => {
    expect(copy['story.told_at']).toBe('เล่าเมื่อ {date}');
    expect(copy['story.counter']).toBe('{n} เรื่องเล่า');
    expect(copy['story.counter.empty']).toBe('ยังไม่มีใครเล่า');
    expect(copy['just_now']).toBe('เล่าเมื่อสักครู่');
    expect(storyCounter(0)).toBe('ยังไม่มีใครเล่า');
    expect(storyCounter(1)).toBe('1 เรื่องเล่า');
    expect(storyCounter(3)).toBe('3 เรื่องเล่า');
    expect(storyToldAt('2026-10-03T00:00:00.000Z', Date.parse('2026-10-28T00:00:00.000Z'))).toBe(
      'เล่าเมื่อ 3 ต.ค. 2569'
    );
    expect(storyToldAt('2026-10-28T00:00:00.000Z', Date.parse('2026-10-28T00:00:30.000Z'))).toBe(
      'เล่าเมื่อสักครู่'
    );
  });

  it('uses Eddy memory edit-conflict copy and field labels', () => {
    expect(copy['memory.edit.conflict.body']).toBe(
      'มีคนแก้ความทรงจำนี้ไปเมื่อกี้ ที่คุณแก้ไว้ยังอยู่ครบ ลองเปิดฉบับล่าสุดดูก่อน แล้วจึงแก้ต่อ'
    );
    expect(copy['memory.edit.conflict.action']).toBe('เปิดฉบับล่าสุด');
    expect(copy['memory.edit.conflict.load_failed']).toBe(
      'ขอโทษด้วย ตอนนี้ยังเปิดฉบับล่าสุดไม่ได้ ที่คุณแก้ไว้ยังอยู่ครบ ลองอีกครั้งได้เลย'
    );
    expect(copy['memory.conflict.changed_fields']).toBe(
      'มีคนแก้{fields}ไปแล้ว ที่คุณแก้ไว้ด้านล่างยังอยู่ครบ'
    );
    expect(copy['memory.title_label']).toBe('ชื่อความทรงจำ');
    expect(copy['memory.conflict.field.title']).toBe('ชื่อความทรงจำ');
    expect(copy['memory.conflict.field.date']).toBe('วันที่');
    expect(copy['memory.conflict.field.people']).toBe('คนในความทรงจำ');
    expect(copy['memory.conflict.field.cover']).toBe('รูปปก');
  });

  it('uses Eddy steward-others pause copy and fills owner_display_name or มีคน', () => {
    expect(copy['memory.pause.others.title']).toBe('พักความทรงจำของ{owner_display_name}ไว้');
    expect(copy['memory.pause.others.body']).toBe(
      'พอพักแล้ว ความทรงจำนี้และเรื่องเล่าข้างในจะเห็นได้แค่{owner_display_name} คุณจะมองไม่เห็นและเลิกพักเองไม่ได้ มีแค่{owner_display_name}ที่เลิกพักได้'
    );
    expect(copy['memory.pause.others.confirm']).toBe('พักไว้');
    expect(copy['memory.pause.others.cancel']).toBe('ยังไม่พัก');
    expect(copy['memory.pause.others.after']).toBe('พักความทรงจำของ{owner_display_name}ไว้แล้ว');
    expect(ownerDisplayName('มาลี ใจดี')).toBe('มาลี ใจดี');
    expect(ownerDisplayName(null)).toBe('มีคน');
    expect(ownerDisplayName('   ')).toBe('มีคน');
    expect(
      interpolate(copy['memory.pause.others.after'], {
        owner_display_name: ownerDisplayName('มาลี ใจดี'),
      })
    ).toBe('พักความทรงจำของมาลี ใจดีไว้แล้ว');
    expect(
      interpolate(copy['memory.pause.others.after'], {
        owner_display_name: ownerDisplayName(null),
      })
    ).toBe('พักความทรงจำของมีคนไว้แล้ว');
    expect(
      interpolateHeading(copy['memory.pause.others.title'], {
        owner_display_name: ownerDisplayName(null),
      })
    ).toBe('พักความทรงจำของมีคนไว้');
  });

  it('uses dedicated memory unavailable title and body, not error.generic.body as the key', () => {
    expect(copy['memory.unavailable.title']).toBe('หาความทรงจำนี้ไม่เจอ');
    expect(copy['memory.unavailable.body']).toBe(
      'ความทรงจำนี้อาจพักไว้อยู่ หรือไม่ได้อยู่ที่นี่แล้ว ลองกลับไปดูที่หน้าแรกก่อน'
    );
    expect(copy['memory.unavailable.home']).toBe('กลับหน้าแรก');
  });

  it('keeps the full name in page headings', () => {
    expect(
      interpolateHeading(copy['welcome.title'], { ชื่อ: 'Aphirat Nimanussonkul' })
    ).toBe('ยินดีต้อนรับ Aphirat Nimanussonkul');
    expect(
      interpolateHeading(copy['home.greeting'], { ชื่อ: 'Aphirat Nimanussonkul' })
    ).toBe('สวัสดี Aphirat Nimanussonkul');
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
