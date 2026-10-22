/**
 * All UI copy. Strings marked verbatim come from voice-and-copy-v0.3.md
 * (Eddy, locked 21 Oct 2026) plus Eddy's first-PR key mapping.
 * Never invent Thai copy here — missing strings are prefixed with TODO.
 */

export const copy = {
  // --- Glossary (user-facing terms) ---
  'glossary.event': 'ความทรงจำ',
  'glossary.contribution': 'เรื่องเล่า',
  'glossary.contribution_count': 'เรื่องเล่า ({จำนวน})',
  'glossary.event_creator': '{ชื่อ} เริ่มความทรงจำนี้',
  'glossary.event_creator_fallback': 'คนเริ่มความทรงจำ',
  'glossary.contribution_owner': 'เล่าโดย {ชื่อ}',
  'glossary.archive': 'พักความทรงจำไว้',
  'glossary.archived': 'พักไว้',
  'glossary.restore_event': 'นำความทรงจำกลับมา',
  'glossary.trash': 'ถังขยะของฉัน',
  'glossary.restore_contribution': 'กู้คืน',
  'glossary.permanent_delete': 'ลบถาวร',
  'glossary.pending': 'รอตอบรับ',
  'glossary.joined': 'เข้าร่วมแล้ว',

  // --- ฟอร์มเรื่องเล่า ---
  'story.placeholder': 'เล่าเรื่องนี้ในแบบที่คุณจำได้',
  'story.label.required': 'เรื่องเล่า (ต้องมี)',
  'photo.label': 'เพิ่มรูป (ถ้ามี)',
  'photo.removed.restore': 'เอากลับ',
  'photo.removed.inline': 'รูปที่เอาออกจะถูกลบเมื่อบันทึก',
  'photo.confirm.title.one': 'ลบรูป 1 รูปถาวรใช่ไหม',
  'photo.confirm.title.many': 'ลบรูป {จำนวน} รูปถาวรใช่ไหม',
  'photo.confirm.body': 'ลบแล้วกู้คืนไม่ได้',
  'photo.confirm.primary': 'บันทึกและลบรูป',
  'photo.confirm.secondary': 'กลับไปแก้ไข',
  'save.toast': 'บันทึกแล้ว',

  // --- ลบเรื่องเล่า / ถังขยะ ---
  'contribution.trash.confirm.title': 'ย้ายเรื่องเล่านี้ไปถังขยะใช่ไหม',
  'contribution.trash.confirm.body':
    'เรื่องเล่าของคนอื่นและตัวความทรงจำยังอยู่เหมือนเดิม คุณกู้คืนได้จากถังขยะของฉัน',
  'contribution.trash.confirm.primary': 'ย้ายไปถังขยะ',
  'trash.title': 'ถังขยะของฉัน',
  'trash.item.active.meta': 'ย้ายมาจาก {ชื่อความทรงจำ}',
  'trash.item.active.restore': 'กู้คืน',
  'trash.item.paused.body':
    'ตอนนี้ {ชื่อความทรงจำ} ถูกพักไว้ จึงยังเปิดดูหรือกู้คืนเรื่องเล่านี้ไม่ได้ ถ้าอยากให้กลับมา ลองติดต่อ {ชื่อคนเริ่ม}',
  'trash.item.deleted.body': 'ความทรงจำเดิมถูกลบแล้ว แต่เรื่องเล่าของคุณยังอยู่ที่นี่',
  'trash.item.deleted.save_photo': 'บันทึกรูป',
  'trash.item.deleted.copy_story': 'คัดลอกเรื่องเล่า',
  'trash.item.deleted.new_one': 'เริ่มความทรงจำใหม่จากเรื่องเล่านี้',
  'trash.item.deleted.new_many': 'เริ่มความทรงจำใหม่',
  'trash.delete.confirm.title': 'ลบ "{ข้อความต้นของเรื่องเล่า}" ถาวรใช่ไหม',
  'trash.delete.confirm.body': 'ลบแล้วจะกู้คืนไม่ได้',
  'trash.delete.confirm.body.paused':
    'ตอนนี้คุณยังเปิดดูเรื่องเล่านี้ไม่ได้เพราะความทรงจำถูกพักไว้ แต่ถ้าลบแล้ว จะกู้คืนไม่ได้อีก',
  'trash.delete.confirm.primary': 'ลบถาวร',
  'trash.delete.confirm.secondary': 'เก็บไว้ก่อน',

  // --- พักและลบความทรงจำ ---
  'memory.pause.action': 'พักความทรงจำไว้',
  'memory.pause.confirm.body':
    'ระหว่างพักไว้ คนอื่นจะเปิดดูหรือแก้เรื่องเล่าในความทรงจำนี้ไม่ได้ คุณนำกลับมาได้ทุกเมื่อ',
  'memory.paused.badge': 'พักไว้',
  'memory.unpause.action': 'นำความทรงจำกลับมา',
  'memory.delete.confirm.title': 'ลบ "{ชื่อความทรงจำ}" ถาวรใช่ไหม',
  'memory.delete.confirm.body':
    'ความทรงจำนี้จะกลับมาไม่ได้อีก ส่วนเรื่องเล่าและรูปที่แต่ละคนเพิ่มไว้จะไม่หายไป เจ้าของยังเก็บไว้ในถังขยะของตัวเองได้',
  'memory.delete.confirm.input_label': 'พิมพ์ "ลบเรื่องนี้" เพื่อยืนยัน',
  'memory.delete.confirm.primary': 'ลบถาวร',
  'memory.delete.confirm.secondary': 'ยกเลิก',
  'notify.memory_deleted':
    '{ชื่อคนเริ่ม} ลบความทรงจำ {ชื่อความทรงจำ} แล้ว แต่เรื่องเล่าและรูปของคุณยังอยู่ครบในถังขยะของคุณ',
  'notify.memory_deleted.action': 'ไปที่ถังขยะของฉัน',

  // --- Error (map จาก code) ---
  'error.STORY_REQUIRED': 'เล่าสักนิดก่อนบันทึก แม้แค่ประโยคเดียวก็ได้',
  'error.CONFIRM_TEXT_MISMATCH': 'ยังพิมพ์ไม่ตรง ลองพิมพ์ "ลบเรื่องนี้" อีกครั้ง',
  'error.MIXED_ORIGIN_EVENTS': 'เลือกได้เฉพาะเรื่องเล่าจากความทรงจำเดียวกัน ลองเลือกใหม่อีกครั้ง',
  'error.FILE_TYPE_NOT_ALLOWED': 'ใช้ไฟล์นี้ไม่ได้ เลือกรูปแบบ JPEG, PNG, HEIC หรือ WebP',
  'error.FILE_TOO_LARGE': 'รูปนี้ใหญ่เกิน 20MB ลองเลือกรูปที่เล็กลง',
  'error.TOO_MANY_PHOTOS': 'เพิ่มรูปได้สูงสุด 20 รูปต่อเรื่องเล่า',
  'error.UNAUTHENTICATED': 'เข้าสู่ระบบอีกครั้งเพื่อทำต่อ สิ่งที่คุณพิมพ์ไว้ยังอยู่',
  'error.NOT_FOUND': 'ไม่พบสิ่งที่กำลังหา อาจถูกย้าย หรือคุณยังไม่ได้รับสิทธิ์เข้าดู',
  'error.FORBIDDEN': 'เฉพาะ {ชื่อคนเริ่ม} หรือผู้ดูแลครอบครัว ที่พักไว้หรือลบความทรงจำนี้ได้',
  'error.FORBIDDEN.contribution': 'เรื่องเล่านี้เป็นของ {ชื่อเจ้าของ} มีแค่เขาที่แก้ไขหรือลบได้',
  'error.FORBIDDEN.invite': 'เฉพาะผู้ดูแลครอบครัวที่ชวนสมาชิกใหม่ได้ ลองขอให้ {ชื่อผู้ดูแล} ชวนให้',
  'error.EVENT_NOT_ACTIVE': 'ความทรงจำนี้ถูกพักไว้ จึงยังเพิ่มหรือแก้ไขไม่ได้',
  'error.EVENT_NOT_ARCHIVED': 'ต้องพักความทรงจำนี้ไว้ก่อน จึงจะลบถาวรได้',
  'error.SOURCE_ARCHIVED': '{ชื่อความทรงจำ} ถูกพักไว้ จึงยังกู้คืนไม่ได้ ลองติดต่อ {ชื่อคนเริ่ม}',
  'error.SOURCE_NOT_DELETED':
    'เรื่องเล่านี้ยังกู้คืนกลับไปความทรงจำเดิมได้ จึงยังเริ่มความทรงจำใหม่จากเรื่องเล่านี้ไม่ได้',
  'error.VERSION_CONFLICT': 'มีการแก้ไขเรื่องเล่านี้จากที่อื่นก่อนหน้า โหลดเวอร์ชันล่าสุดก่อน แล้วค่อยแก้อีกครั้ง',
  'error.RATE_LIMITED': 'ขอเวลาสักครู่ แล้วลองอีกครั้ง',
  'error.INVALID_INPUT': 'ข้อมูลบางช่องยังไม่ถูกต้อง ลองตรวจอีกครั้ง',
  'error.INTERNAL_ERROR': 'ระบบขัดข้องชั่วคราว ข้อมูลของคุณยังอยู่ครบ ลองใหม่อีกครั้ง',
  'error.network': 'ยังเชื่อมต่อไม่ได้ ลองตรวจอินเทอร์เน็ต แล้วลองใหม่',
  'error.generic': 'มีบางอย่างผิดพลาด ลองใหม่อีกครั้ง',

  // --- ลบความทรงจำถาวร (กติกา 7 วัน) ---
  'memory.delete.locked': 'ลบถาวรได้ตั้งแต่ {วันที่} (หลังพักไว้ครบ 7 วัน)',
  'error.NOT_YET_DELETABLE.has_date':
    'ความทรงจำนี้ต้องพักไว้ครบ 7 วันก่อน จึงจะลบถาวรได้ ลบได้ตั้งแต่ {วันที่}',
  'error.NOT_YET_DELETABLE.null': 'ต้องพักความทรงจำนี้ไว้ก่อน แล้วรอครบ 7 วัน จึงจะลบถาวรได้',
  'memory.pause.confirm.note': 'ถ้าต้องการลบถาวร ต้องพักไว้ครบ 7 วันก่อน',

  // --- สมาชิกและผู้ดูแล ---
  'members.title': 'สมาชิกในครอบครัว',
  'members.role.admin': 'ผู้ดูแล',
  'members.action.make_admin': 'ตั้งเป็นผู้ดูแล',
  'members.make_admin.confirm':
    'ตั้ง {ชื่อ} เป็นผู้ดูแลใช่ไหม ผู้ดูแลชวนสมาชิกใหม่ แก้ข้อมูลหลักของความทรงจำ และพักไว้หรือลบความทรงจำได้ แต่แก้หรือลบเรื่องเล่าของคนอื่นไม่ได้',
  'members.action.remove_admin': 'ถอดบทบาทผู้ดูแล',
  'members.action.remove_member': 'นำออกจากครอบครัว',
  'members.remove.confirm':
    'นำ {ชื่อ} ออกจากครอบครัวใช่ไหม {ชื่อ} จะเปิดดูความทรงจำของครอบครัวนี้ไม่ได้อีก',
  'members.action.leave': 'ออกจากครอบครัวนี้',
  'invite.status.pending': 'รอตอบรับ',
  'invite.status.accepted': 'เข้าร่วมแล้ว',
  'invite.status.revoked': 'ยกเลิกคำชวนแล้ว',
  'invite.status.expired': 'คำชวนหมดอายุแล้ว',
  'invite.expiry_note': 'คำชวนนี้ใช้ได้ถึง {วันที่}',
  'invite.action.revoke': 'ยกเลิกคำชวน',
  'invite.action.resend': 'ชวนอีกครั้ง',
  'invite.landing.expired': 'คำชวนนี้หมดอายุแล้ว ลองขอให้ {ชื่อผู้ชวน} ชวนใหม่อีกครั้ง',
  'invite.landing.revoked': 'คำชวนนี้ใช้ไม่ได้แล้ว ลองติดต่อ {ชื่อผู้ชวน}',
  'error.LAST_ADMIN':
    'คุณเป็นผู้ดูแลคนเดียวของครอบครัวนี้ ตั้งสมาชิกคนอื่นเป็นผู้ดูแลก่อน แล้วค่อยทำต่อ',
  'error.LAST_ADMIN.other': '{ชื่อ} เป็นผู้ดูแลคนเดียวของครอบครัวนี้ ตั้งคนอื่นเป็นผู้ดูแลก่อน',
  'LAST_ADMIN.action': 'ตั้งคนอื่นเป็นผู้ดูแล',

  // --- สมาชิกคนสุดท้ายออก / ลบบัญชี ---
  'family.last_member.confirm.title': 'ลบครอบครัว "{ชื่อครอบครัว}" ไปพร้อมกันใช่ไหม',
  'family.last_member.confirm.body':
    'คุณเป็นสมาชิกคนสุดท้าย ถ้าทำต่อ ครอบครัวนี้ ความทรงจำ เรื่องเล่า และรูปทั้งหมดจะถูกลบถาวร และกู้คืนไม่ได้',
  'family.last_member.confirm.input_label': 'พิมพ์ "ลบเรื่องนี้" เพื่อยืนยัน',
  'family.last_member.confirm.primary': 'ลบครอบครัวถาวร',
  'family.last_member.confirm.secondary': 'ยกเลิก',

  // --- ยินยอมรับอีเมล ---
  'consent.checkbox': 'ส่งอีเมลมาบอกเมื่อ Still With You มีฟีเจอร์ใหม่',
  'consent.helper': 'ส่งไปที่ {อีเมล} ไม่บ่อย และยกเลิกได้ทุกเมื่อในหน้าตั้งค่า',
  'consent.continue': 'ไปต่อ',
  'settings.consent.toggle': 'อีเมลแจ้งฟีเจอร์ใหม่',
  'settings.consent.on': 'เปิดรับแล้ว จะส่งไปที่ {อีเมล}',
  'settings.consent.off': 'ปิดรับแล้ว จะไม่ส่งอีเมลแนะนำฟีเจอร์ใหม่อีก',
  'email.unsubscribe': 'ยกเลิกรับอีเมลแบบนี้',

  // --- Empty / offline states ---
  'trash.empty.title': 'ถังขยะของฉันว่างอยู่',
  'trash.empty.body': 'เรื่องเล่าที่คุณลบหรือที่มาจากความทรงจำที่ถูกลบ จะมาอยู่ที่นี่',
  'archived.empty.title': 'ยังไม่มีความทรงจำที่พักไว้',
  'archived.empty.body': 'ความทรงจำที่พักไว้จะซ่อนจากหน้าหลัก และนำกลับมาได้ทุกเมื่อ',
  'offline.title': 'ตอนนี้ยังเชื่อมต่อไม่ได้',
  'offline.body': 'ลองตรวจอินเทอร์เน็ต แล้วลองใหม่อีกครั้ง',
  'offline.action': 'ลองใหม่',
  'offline.banner': 'ตอนนี้ออฟไลน์อยู่ บางอย่างอาจยังไม่อัปเดต',
  'online.toast': 'กลับมาออนไลน์แล้ว',

  // --- ถอดบทบาทผู้ดูแล ---
  'member.menu.remove_admin': 'ถอดบทบาทผู้ดูแล',
  'admin.remove.other.title': 'ถอด {ชื่อ} ออกจากผู้ดูแลไหม',
  'admin.remove.other.body':
    '{ชื่อ} ยังอยู่ในครอบครัวและเห็นความทรงจำเหมือนเดิม แต่จะชวนสมาชิกหรือจัดการความทรงจำของคนอื่นไม่ได้แล้ว',
  'admin.remove.other.confirm': 'ถอดบทบาท',
  'admin.remove.self.title': 'ถอดตัวเองออกจากผู้ดูแลไหม',
  'admin.remove.self.body':
    'คุณยังอยู่ในครอบครัวและเห็นความทรงจำเหมือนเดิม แต่จะชวนสมาชิกหรือจัดการความทรงจำของคนอื่นไม่ได้แล้ว ถ้าอยากกลับมาเป็นผู้ดูแล ต้องให้ผู้ดูแลคนอื่นตั้งให้',
  'admin.remove.self.confirm': 'ถอดบทบาทของฉัน',
  'admin.remove.cancel': 'ยกเลิก',
  'admin.remove.other.success': '{ชื่อ} ไม่ได้เป็นผู้ดูแลแล้ว',
  'admin.remove.self.success': 'คุณไม่ได้เป็นผู้ดูแลแล้ว',
  'admin.set.success': 'ตั้ง {ชื่อ} เป็นผู้ดูแลแล้ว',
  'member.role.NOT_FOUND': 'ไม่พบ {ชื่อ} ในครอบครัวนี้แล้ว อาจออกจากครอบครัวไปแล้ว',

  // --- เข้าสู่ระบบ ---
  'login.title': 'Still With You',
  'login.tagline': 'พื้นที่เก็บความทรงจำของครอบครัว เล่าเรื่องเดียวกันจากมุมของแต่ละคน',
  'login.google': 'เข้าสู่ระบบด้วย Google',
  'auth.login.google': 'เข้าสู่ระบบด้วย Google',
  'login.loading': 'กำลังเข้าสู่ระบบ',
  'login.privacy_note': 'เฉพาะคนที่ครอบครัวชวนเท่านั้นที่เห็นความทรงจำของครอบครัว',
  'login.error.cancelled': 'ยังไม่ได้เข้าสู่ระบบ ลองอีกครั้งได้เลย',
  'login.error.failed': 'เข้าสู่ระบบไม่สำเร็จ ลองอีกครั้ง',
  'session.expired': 'เข้าสู่ระบบไว้นานแล้ว เข้าสู่ระบบอีกครั้งเพื่อไปต่อ',
  'logout.action': 'ออกจากระบบ',
  'auth.logout': 'ออกจากระบบ',
  'logout.confirm.title': 'ออกจากระบบไหม',
  'logout.confirm.body': 'ความทรงจำทั้งหมดยังอยู่ครบ เข้าสู่ระบบด้วยบัญชีเดิมเมื่อไรก็ได้',
  'logout.confirm.primary': 'ออกจากระบบ',

  // --- เข้าใช้ครั้งแรก ---
  'welcome.title': 'ยินดีต้อนรับ {ชื่อ}',
  'welcome.body': 'ก่อนเริ่ม เลือกได้ว่าจะรับอีเมลจากเราหรือไม่ เปลี่ยนใจได้ทุกเมื่อในการตั้งค่า',

  // --- หน้าแรก / ครอบครัว / ความทรงจำ ---
  'nav.memories': 'ความทรงจำ',
  'nav.family': 'ครอบครัว',
  'nav.trash': 'ถังขยะของฉัน',
  'nav.settings': 'ตั้งค่า',
  'families.title': 'ครอบครัวของคุณ',
  'family.list.title': 'ครอบครัวของคุณ',
  'families.empty.title': 'ยังไม่ได้อยู่ในครอบครัวไหน',
  'family.empty.title': 'ยังไม่ได้อยู่ในครอบครัวไหน',
  'families.empty.body': 'เริ่มครอบครัวของคุณเอง หรือเปิดลิงก์คำชวนที่ได้รับจากคนในครอบครัว',
  'family.empty.body': 'เริ่มครอบครัวของคุณเอง หรือเปิดลิงก์คำชวนที่ได้รับจากคนในครอบครัว',
  'families.empty.action': 'เริ่มครอบครัวใหม่',
  'family.create.action': 'เริ่มครอบครัวใหม่',
  'families.create.title': 'เริ่มครอบครัวใหม่',
  'families.create.name_label': 'ชื่อครอบครัว',
  'family.create.name_label': 'ชื่อครอบครัว',
  'families.create.name_placeholder': 'เช่น บ้านคุณยายสมศรี',
  'family.create.name_placeholder': 'เช่น บ้านคุณยายสมศรี',
  'families.create.submit': 'สร้างครอบครัว',
  'family.create.success': 'เริ่มครอบครัว {ชื่อครอบครัว} แล้ว',
  'memory.list.title': 'ความทรงจำ',
  'memories.empty.title': 'ยังไม่มีความทรงจำ',
  'memory.empty.title': 'ยังไม่มีความทรงจำ',
  'memories.empty.body': 'เริ่มจากเรื่องเล็ก ๆ ที่ยังจำได้ แล้วชวนคนอื่นมาเล่าต่อจากมุมของเขา',
  'memory.empty.body': 'เริ่มจากเรื่องเล็ก ๆ ที่ยังจำได้ แล้วชวนคนอื่นมาเล่าต่อจากมุมของเขา',
  'memories.empty.action': 'เริ่มความทรงจำใหม่',
  'memory.create.action': 'เริ่มความทรงจำใหม่',
  'memories.create.title': 'เริ่มความทรงจำใหม่',
  'memories.create.story_label': 'เรื่องเล่า (ต้องมี)',
  'memories.create.story_placeholder': 'เล่าเรื่องนี้ในแบบที่คุณจำได้',
  'memories.create.submit': 'บันทึกความทรงจำ',
  'memories.create.title_label': 'ชื่อความทรงจำ',
  'memories.create.title_placeholder': 'เช่น วันเกิดครบ 80 ปีของคุณยาย',
  'memory.item.meta': '{จำนวน} เรื่องเล่า · เริ่มโดย {ชื่อ}',
  'memory.item.meta.one': '1 เรื่องเล่า · เริ่มโดย {ชื่อ}',

  // --- สถานะทั่วไป ---
  'loading': 'กำลังโหลด',
  'loading.body': 'กำลังโหลด',
  'loading.slow': 'ใช้เวลานานกว่าปกติ รออีกสักครู่',
  'retry': 'ลองใหม่',
  'back_home': 'กลับหน้าแรก',
  'page.not_found.title': 'ไม่พบหน้านี้',
  'page.not_found.body': 'ลิงก์อาจไม่ถูกต้อง หรือหน้านี้ถูกย้ายไปแล้ว',
  'pwa.update.body': 'มีเวอร์ชันใหม่พร้อมใช้',
  'pwa.update.action': 'อัปเดตเลย',
  'pwa.install.action': 'เพิ่มไว้ที่หน้าจอหลัก',
} as const;

export type CopyKey = keyof typeof copy;

export function interpolate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{([^}]+)\}/g, (match, key: string) =>
    Object.prototype.hasOwnProperty.call(vars, key) ? vars[key] : match
  );
}
