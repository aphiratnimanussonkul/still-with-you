/**
 * All UI copy. Strings are verbatim from voice-and-copy-v0.4.md
 * (Eddy, locked with Aphirat 21 Oct 2026; v0.4 + aria-label keys 22 Oct 2026).
 * Never invent Thai copy here — missing strings are prefixed with TODO.
 */

export const copy = {
  // --- Glossary (user-facing terms from v0.4 §2) ---
  'glossary.event': 'ความทรงจำ',
  'glossary.contribution': 'เรื่องเล่า',
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
  'contribution.trash.toast': 'ย้ายไปถังขยะของฉันแล้ว',
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
  'trash.select.title': 'เลือกแล้ว {จำนวน}',
  'trash.restore.success': 'กู้คืนไปที่ {ชื่อความทรงจำ} แล้ว',

  // --- พักและลบความทรงจำ ---
  'memory.pause.action': 'พักความทรงจำไว้',
  'memory.pause.confirm.title': 'พัก "{ชื่อความทรงจำ}" ไว้ใช่ไหม',
  'memory.pause.confirm.body':
    'ระหว่างพักไว้ คนอื่นจะเปิดดูหรือแก้เรื่องเล่าในความทรงจำนี้ไม่ได้ คุณนำกลับมาได้ทุกเมื่อ',
  'memory.pause.confirm.note': 'ถ้าต้องการลบถาวร ต้องพักไว้ครบ 7 วันก่อน',
  'memory.pause.success': 'พัก {ชื่อความทรงจำ} ไว้แล้ว',
  'memory.paused.badge': 'พักไว้',
  'memory.paused.banner':
    'ความทรงจำนี้ถูกพักไว้ คนอื่นมองไม่เห็น และตอนนี้เปิดดูได้อย่างเดียว',
  'memory.unpause.action': 'นำความทรงจำกลับมา',
  'memory.delete.confirm.title': 'ลบ "{ชื่อความทรงจำ}" ถาวรใช่ไหม',
  'memory.delete.confirm.body':
    'ความทรงจำนี้จะกลับมาไม่ได้อีก ส่วนเรื่องเล่าและรูปที่แต่ละคนเพิ่มไว้จะไม่หายไป เจ้าของยังเก็บไว้ในถังขยะของตัวเองได้',
  'memory.delete.confirm.input_label': 'พิมพ์ "ลบเรื่องนี้" เพื่อยืนยัน',
  'memory.delete.confirm.primary': 'ลบถาวร',
  'memory.delete.locked': 'ลบถาวรได้ตั้งแต่ {วันที่} (หลังพักไว้ครบ 7 วัน)',
  'memory.delete.success': 'ลบถาวรแล้ว เรื่องเล่าแต่ละคนอยู่ในถังขยะของเจ้าของ',
  'notify.memory_deleted':
    '{ชื่อคนเริ่ม} ลบความทรงจำ {ชื่อความทรงจำ} แล้ว แต่เรื่องเล่าและรูปของคุณยังอยู่ครบในถังขยะของคุณ',
  'notify.memory_deleted.action': 'ไปที่ถังขยะของฉัน',
  'notify.contribution_added': '{actor_display_name} เล่าเรื่องใน {event_title}',
  'notify.invite_accepted': '{actor_display_name} รับคำเชิญและเข้าร่วม {family_name} แล้ว',

  // --- Error (map จาก code) ---
  'error.STORY_REQUIRED': 'เล่าสักนิดก่อนบันทึก แม้แค่ประโยคเดียวก็ได้',
  'error.CONFIRM_TEXT_MISMATCH': 'ยังพิมพ์ไม่ตรง ลองพิมพ์ "ลบเรื่องนี้" อีกครั้ง',
  'error.MIXED_ORIGIN_EVENTS': 'เลือกได้เฉพาะเรื่องเล่าจากความทรงจำเดียวกัน ลองเลือกใหม่อีกครั้ง',
  'error.FILE_TYPE_NOT_ALLOWED': 'ใช้ไฟล์นี้ไม่ได้ เลือกรูปแบบ JPEG, PNG, HEIC หรือ WebP',
  'error.UNSUPPORTED_TYPE': 'ใช้ไฟล์นี้ไม่ได้ เลือกรูปแบบ JPEG, PNG, HEIC หรือ WebP',
  'error.FILE_TOO_LARGE': 'รูปนี้ใหญ่เกิน {max_mb}MB ลองเลือกรูปอื่น',
  'error.TOO_MANY_PHOTOS': 'เพิ่มรูปได้สูงสุด {max} รูปต่อเรื่องเล่า',
  'error.UPLOAD_MISMATCH': 'อัปโหลดรูปนี้ไม่สำเร็จ ลองเลือกรูปนี้อีกครั้ง',
  'error.MEDIA_NOT_READY': 'รูปบางรูปยังอัปโหลดไม่เสร็จ รอสักครู่แล้วบันทึกอีกครั้ง',
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
  'error.INVALID_DEATH_DATE': 'วันที่จากไปต้องไม่ก่อนวันเกิด และไม่เกินวันนี้',
  'error.ANSWER_REQUIRED': 'พิมพ์คำตอบสักนิดก่อนบันทึก',
  'error.TOO_MANY_FOCUS': 'เลือกได้สูงสุด 10 คน เอาบางคนออกก่อนแล้วค่อยเพิ่ม',
  'error.ALREADY_ANSWERED': 'คุณเคยตอบคำถามนี้แล้ว แก้คำตอบเดิมได้เลย',
  'error.INTERNAL_ERROR': 'ระบบขัดข้องชั่วคราว ข้อมูลของคุณยังอยู่ครบ ลองใหม่อีกครั้ง',
  'error.generic': 'มีบางอย่างผิดพลาด ลองใหม่อีกครั้ง',
  'error.network': 'ยังเชื่อมต่อไม่ได้ ลองตรวจอินเทอร์เน็ต แล้วลองใหม่',
  'error.unknown': 'มีบางอย่างผิดพลาด ลองใหม่อีกครั้ง',
  'error.NOT_YET_DELETABLE.has_date':
    'ความทรงจำนี้ต้องพักไว้ครบ 7 วันก่อน จึงจะลบถาวรได้ ลบได้ตั้งแต่ {วันที่}',
  'error.NOT_YET_DELETABLE.null': 'ต้องพักความทรงจำนี้ไว้ก่อน แล้วรอครบ 7 วัน จึงจะลบถาวรได้',
  'error.LAST_ADMIN':
    'คุณเป็นผู้ดูแลคนเดียวของครอบครัวนี้ ตั้งสมาชิกคนอื่นเป็นผู้ดูแลก่อน แล้วค่อยทำต่อ',
  'error.LAST_ADMIN.other': '{ชื่อ} เป็นผู้ดูแลคนเดียวของครอบครัวนี้ ตั้งคนอื่นเป็นผู้ดูแลก่อน',

  // --- สมาชิกและผู้ดูแล ---
  'members.title': 'สมาชิกในครอบครัว',
  'members.role.admin': 'ผู้ดูแล',
  'members.you': '(คุณ)',
  'members.action.make_admin': 'ตั้งเป็นผู้ดูแล',
  'members.make_admin.confirm.title': 'ตั้ง {ชื่อ} เป็นผู้ดูแลใช่ไหม',
  'members.make_admin.confirm.body':
    'ผู้ดูแลชวนสมาชิกใหม่ แก้ข้อมูลหลักของความทรงจำ และพักไว้หรือลบความทรงจำได้ แต่แก้หรือลบเรื่องเล่าของคนอื่นไม่ได้',
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
  'invite.action': 'ชวนสมาชิก',
  'invite.action.revoke': 'ยกเลิกคำชวน',
  'invite.action.resend': 'ชวนอีกครั้ง',
  'invite.title': 'ชวนคนในครอบครัว',
  'invite.body': 'ส่งลิงก์ให้คนในครอบครัวมาเห็นและเล่าความทรงจำด้วยกัน ลิงก์ใช้ได้ 7 วัน',
  'invite.email_label': 'อีเมลของคนที่จะชวน',
  'invite.send': 'ส่งคำชวน',
  'invite.copy_link': 'คัดลอกลิงก์',
  'invite.list.title': 'คำชวนที่รอตอบรับ',
  'invite.copied.toast': 'คัดลอกลิงก์แล้ว',
  'invite.landing.title': '{ชื่อผู้ชวน} ชวนคุณเข้าครอบครัว {ชื่อครอบครัว}',
  'invite.landing.body':
    'เปิดดูความทรงจำของครอบครัว และเล่าเรื่องเดียวกันจากมุมของคุณเอง เห็นกันแค่คนในครอบครัว',
  'invite.landing.accept': 'เข้าร่วมครอบครัว',
  'invite.landing.decline': 'ไว้ทีหลัง',
  'invite.landing.expired': 'คำชวนนี้หมดอายุแล้ว ลองขอให้ {ชื่อผู้ชวน} ชวนใหม่อีกครั้ง',
  'invite.landing.revoked': 'คำชวนนี้ใช้ไม่ได้แล้ว ลองติดต่อ {ชื่อผู้ชวน}',
  'invite.accepted.title': 'ยินดีต้อนรับสู่ {ชื่อครอบครัว}',
  'invite.accepted.next': 'ไปดูความทรงจำ',
  'LAST_ADMIN.action': 'ตั้งคนอื่นเป็นผู้ดูแล',

  // --- สมาชิกคนสุดท้ายออก / ลบบัญชี ---
  'family.last_member.confirm.title': 'ลบครอบครัว "{ชื่อครอบครัว}" ไปพร้อมกันใช่ไหม',
  'family.last_member.confirm.body':
    'คุณเป็นสมาชิกคนสุดท้าย ถ้าทำต่อ ครอบครัวนี้ ความทรงจำ เรื่องเล่า และรูปทั้งหมดจะถูกลบถาวร และกู้คืนไม่ได้',
  'family.last_member.confirm.input_label': 'พิมพ์ "ลบเรื่องนี้" เพื่อยืนยัน',
  'family.last_member.confirm.primary': 'ลบครอบครัวถาวร',

  // --- ยินยอมรับอีเมล / ตั้งค่า ---
  'consent.checkbox': 'ส่งอีเมลมาบอกเมื่อ Still With You มีฟีเจอร์ใหม่',
  'consent.helper': 'ส่งไปที่ {อีเมล} ไม่บ่อย และยกเลิกได้ทุกเมื่อในหน้าตั้งค่า',
  'consent.continue': 'ไปต่อ',
  'settings.account.title': 'บัญชีของคุณ',
  'settings.consent.toggle': 'อีเมลแจ้งฟีเจอร์ใหม่',
  'settings.consent.on': 'เปิดรับแล้ว จะส่งไปที่ {อีเมล}',
  'settings.consent.off': 'ปิดรับแล้ว จะไม่ส่งอีเมลแนะนำฟีเจอร์ใหม่อีก',
  'email.unsubscribe': 'ยกเลิกรับอีเมลแบบนี้',

  // --- Empty / offline ---
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
  'admin.remove.other.title': 'ถอด {ชื่อ} ออกจากผู้ดูแลไหม',
  'admin.remove.other.body':
    '{ชื่อ} ยังอยู่ในครอบครัวและเห็นความทรงจำเหมือนเดิม แต่จะชวนสมาชิกหรือจัดการความทรงจำของคนอื่นไม่ได้แล้ว',
  'admin.remove.other.confirm': 'ถอดบทบาท',
  'admin.remove.self.title': 'ถอดตัวเองออกจากผู้ดูแลไหม',
  'admin.remove.self.body':
    'คุณยังอยู่ในครอบครัวและเห็นความทรงจำเหมือนเดิม แต่จะชวนสมาชิกหรือจัดการความทรงจำของคนอื่นไม่ได้แล้ว ถ้าอยากกลับมาเป็นผู้ดูแล ต้องให้ผู้ดูแลคนอื่นตั้งให้',
  'admin.remove.self.confirm': 'ถอดบทบาทของฉัน',
  'admin.remove.other.success': '{ชื่อ} ไม่ได้เป็นผู้ดูแลแล้ว',
  'admin.remove.self.success': 'คุณไม่ได้เป็นผู้ดูแลแล้ว',
  'admin.set.success': 'ตั้ง {ชื่อ} เป็นผู้ดูแลแล้ว',
  'member.role.NOT_FOUND': 'ไม่พบ {ชื่อ} ในครอบครัวนี้แล้ว อาจออกจากครอบครัวไปแล้ว',

  // --- เข้าสู่ระบบ ---
  'login.title': 'Still With You',
  'login.tagline': 'พื้นที่เก็บความทรงจำของครอบครัว เล่าเรื่องเดียวกันจากมุมของแต่ละคน',
  'login.google': 'เข้าสู่ระบบด้วย Google',
  'login.loading': 'กำลังเข้าสู่ระบบ',
  'login.privacy_note': 'เฉพาะคนที่ครอบครัวชวนเท่านั้นที่เห็นความทรงจำของครอบครัว',
  'login.error.cancelled': 'ยังไม่ได้เข้าสู่ระบบ ลองอีกครั้งได้เลย',
  'login.error.failed': 'เข้าสู่ระบบไม่สำเร็จ ลองอีกครั้ง',
  'session.expired': 'เข้าสู่ระบบไว้นานแล้ว เข้าสู่ระบบอีกครั้งเพื่อไปต่อ',
  'logout.action': 'ออกจากระบบ',
  'logout.confirm.title': 'ออกจากระบบไหม',
  'logout.confirm.body': 'ความทรงจำทั้งหมดยังอยู่ครบ เข้าสู่ระบบด้วยบัญชีเดิมเมื่อไรก็ได้',
  'logout.confirm.primary': 'ออกจากระบบ',

  // --- เข้าใช้ครั้งแรก ---
  'welcome.title': 'ยินดีต้อนรับ {ชื่อ}',
  'welcome.body': 'ก่อนเริ่ม เลือกได้ว่าจะรับอีเมลจากเราหรือไม่ เปลี่ยนใจได้ทุกเมื่อในการตั้งค่า',

  // --- หน้าแรก / ครอบครัว / ความทรงจำ ---
  'nav.home': 'หน้าแรก',
  'nav.memories': 'ความทรงจำ',
  'nav.family': 'ครอบครัว',
  'nav.me': 'ฉัน',
  'nav.trash': 'ถังขยะของฉัน',
  'nav.settings': 'ตั้งค่า',
  'family.switcher': 'เปลี่ยนครอบครัว',
  'a11y.family_switcher': 'ครอบครัวที่เลือกอยู่: {ชื่อครอบครัว}',
  'home.focus.title': 'คนที่คุณอยากระลึกถึง',
  'home.focus.see_all': 'ดูทั้งหมด',
  'home.focus.invite.title': 'อยากระลึกถึงใครเป็นพิเศษ',
  'home.focus.invite.body':
    'เลือกคนในครอบครัวมาไว้บนหน้านี้ แล้วจะมีคำถามเล็กๆ ช่วยให้รู้จักเขามากขึ้น เห็นเฉพาะคุณ',
  'home.focus.invite.action': 'เลือกคน',
  'home.question.title': 'คำถามเล็กๆ สำหรับคุณ',
  'home.question.save': 'บันทึกคำตอบ',
  'home.question.skip': 'ข้ามคำถามนี้',
  'home.question.saved.toast': 'บันทึกคำตอบแล้ว',
  'home.question.skipped.toast': 'ข้ามไปก่อน คำถามนี้จะกลับมาอีกในภายหลัง',
  'home.question.already_answered.action': 'แก้คำตอบเดิม',
  'family.focus.toggle': 'แสดงบนหน้าแรก',
  'family.focus.note': 'เห็นเฉพาะคุณ',
  'family.focus.load_error': 'โหลดรายชื่อบนหน้าแรกไม่สำเร็จ',
  'family.focus.load_error.action': 'ลองอีกครั้ง',
  'trash.item.active.meta.family': 'ย้ายมาจาก {ชื่อความทรงจำ} · {ชื่อครอบครัว}',
  'family.list.title': 'ครอบครัวของคุณ',
  'family.empty.title': 'ยังไม่ได้อยู่ในครอบครัวไหน',
  'family.empty.body': 'เริ่มครอบครัวของคุณเอง หรือเปิดลิงก์คำชวนที่ได้รับจากคนในครอบครัว',
  'family.create.action': 'เริ่มครอบครัวใหม่',
  'family.create.title': 'เริ่มครอบครัวใหม่',
  'family.create.helper': 'เปลี่ยนชื่อทีหลังได้ และคุณจะเป็นผู้ดูแลคนแรก',
  'family.create.name_label': 'ชื่อครอบครัว',
  'family.create.name_placeholder': 'เช่น บ้านคุณยายสมศรี',
  'family.create.name_required': 'ตั้งชื่อครอบครัวก่อน แล้วค่อยสร้าง',
  'family.create.submit': 'สร้างครอบครัว',
  'family.create.success': 'เริ่มครอบครัว {ชื่อครอบครัว} แล้ว',
  'family.item.meta': '{จำนวน} คน · {บทบาทของฉัน}',
  'family.tab.tree': 'แผนผังครอบครัว',
  'family.tab.members': 'สมาชิก',
  'family.tab.graph': 'ผัง',
  'family.tab.list': 'รายชื่อ',
  'memory.list.title': 'ความทรงจำ',
  'memory.empty.title': 'ยังไม่มีความทรงจำ',
  'memory.empty.body': 'เริ่มจากเรื่องเล็ก ๆ ที่ยังจำได้ แล้วชวนคนอื่นมาเล่าต่อจากมุมของเขา',
  'memory.create.action': 'เริ่มความทรงจำใหม่',
  'memory.create.title': 'เริ่มความทรงจำใหม่',
  'memory.create.submit': 'บันทึก',
  'memory.title_label': 'ชื่อความทรงจำ',
  'memory.title_placeholder': 'เช่น ทริปหัวหินปี 2539',
  'memory.title_required': 'ตั้งชื่อความทรงจำก่อน แล้วค่อยบันทึก',
  'memory.date_label': 'เกิดขึ้นเมื่อไร',
  'memory.date_placeholder': 'ไม่แน่ใจ ใส่แค่ปีก็ได้',
  'memory.people_label': 'ใครอยู่ในความทรงจำนี้',
  'memory.item.meta': '{จำนวน} เรื่องเล่า · เริ่มโดย {ชื่อ}',
  'memory.item.meta.one': '1 เรื่องเล่า · เริ่มโดย {ชื่อ}',
  'memory.stories.title': 'เรื่องเล่า ({จำนวน})',
  'memory.stories.load_error': 'โหลดเรื่องเล่าไม่สำเร็จ ลองใหม่อีกครั้ง',
  'memory.stories.retry': 'ลองอีกครั้ง',
  'memory.search.placeholder': 'ค้นชื่อความทรงจำหรือคน',
  'memory.filter.all': 'ทั้งหมด',
  'memory.filter.paused': 'พักไว้',
  'memory.edit.title': 'แก้ไขความทรงจำ',
  'memory.detail.meta': '{ชื่อคนเริ่ม} เริ่มความทรงจำนี้ · {ปี/วันที่}',
  'memory.action.edit': 'แก้ข้อมูลความทรงจำ',
  'search.empty.title': 'ไม่พบความทรงจำที่ตรงกับ "{คำค้น}"',
  'search.empty.body': 'ลองค้นด้วยคำอื่น หรือชื่อคนที่อยู่ในความทรงจำนั้น',
  'story.add.action': 'เล่าจากมุมของคุณ',
  'story.add.title': 'เล่าจากมุมของคุณ',
  'story.add.context': 'เล่าใน {ชื่อความทรงจำ} ไม่ทับเรื่องเล่าของใคร',
  'story.save': 'บันทึก',
  'story.action.edit': 'แก้ไข',

  // --- บุคคล / แผนผัง ---
  'person.add.action': 'เพิ่มคน',
  'person.add.submit': 'เพิ่มในผัง',
  'tree.empty.title': 'แผนผังครอบครัวยังว่างอยู่',
  'tree.empty.body':
    'เพิ่มคนในครอบครัวได้ แม้คนนั้นจะไม่ได้ใช้แอป เช่น คุณยายหรือคนที่จากไปแล้ว',
  'tree.only_self.title': 'เริ่มเพิ่มคนในครอบครัว',
  'tree.only_self.body': 'เพิ่มพ่อแม่ ลูก หรือคู่ของคุณ เพื่อเริ่มต้นผัง',
  'tree.fallback': 'แสดงผังไม่ได้ จึงแสดงเป็นรายชื่อแทน',
  'tree.back_to_me': 'กลับมาที่ฉัน',
  'tree.unrelated.title': 'ยังไม่ได้ระบุความสัมพันธ์',
  'tree.unrelated.body': 'แตะที่คนเพื่อเพิ่มความสัมพันธ์ในผัง',
  'tree.node.add': 'เพิ่มคนที่เกี่ยวกับ {ชื่อ}',
  'tree.node.add_parent': 'เพิ่มพ่อแม่',
  'tree.node.add_child': 'เพิ่มลูก',
  'tree.node.add_spouse': 'เพิ่มคู่',
  'person.add.title': 'เพิ่มคนในครอบครัว',
  'person.name_label': 'ชื่อที่ใช้เรียก',
  'person.name_placeholder': 'เช่น ยายสมศรี',
  'person.relation_label': 'เกี่ยวข้องกับใคร อย่างไร',
  'person.relation_placeholder': 'เลือกความสัมพันธ์',
  'person.relationship.of_you': 'เป็นอะไรกับคุณ',
  'person.relationship.of_name': 'เป็นอะไรกับ {ชื่อ}',
  'person.relationship.parent': 'พ่อแม่',
  'person.relationship.child': 'ลูก',
  'person.relationship.spouse': 'คู่',
  'person.living': 'ยังมีชีวิตอยู่',
  'person.death.label': 'วันที่จากไป (ไม่บังคับ)',
  'person.death.year_only': 'รู้แค่ปีที่จากไป',
  'person.death.age': 'จากไปเมื่ออายุ {อายุ} ปี',
  'person.invite.after.title': 'ชวน {ชื่อ} เข้าครอบครัวไหม',
  'person.invite.after.body': 'ถ้า {ชื่อ} เข้ามา จะได้ช่วยเล่าความทรงจำด้วยกัน',
  'person.invite.after.action': 'ชวน',
  'person.invite.after.later': 'ไว้ทีหลัง',
  'person.save': 'บันทึก',
  'person.relation.meta': '{ความสัมพันธ์} · ไม่มีบัญชี',
  'person.memories.title': 'ความทรงจำ ({จำนวน})',
  'person.saved.title': 'เพิ่ม {ชื่อ} ในครอบครัวแล้ว',
  'person.saved.next': 'เริ่มความทรงจำของเขา',
  'person.facts.title': 'เรื่องที่รู้เกี่ยวกับ{name}',
  'person.facts.empty.title': 'ยังไม่มีใครเล่าเรื่องเกี่ยวกับ{name}',
  'person.facts.empty.body': 'คำตอบจากคำถามเล็กๆ ของทุกคนในครอบครัวจะมาอยู่ที่นี่',
  'person.facts.answer.meta': 'ตอบโดย {ผู้ตอบ} · {วันที่}',

  // --- อัปโหลด / ร่าง / อื่น ๆ จาก wireframe 82 ---
  'photo.upload.progress': 'อัปโหลดรูป {เสร็จ}/{ทั้งหมด}',
  'photo.upload.failed': 'อัปโหลดรูปนี้ไม่สำเร็จ',
  'photo.upload.wait': 'รอรูปอัปโหลดให้เสร็จก่อน จึงจะบันทึกได้',
  // Counter format specified for photo attach; not in the original v0.4 key table.
  'photo.count': '{n}/{max} รูป',
  'person_ids.invalid': 'มีบางคนที่เลือกไว้ไม่ได้อยู่ในครอบครัวนี้แล้ว ลองเลือกใหม่',
  'unsaved.title': 'ออกโดยยังไม่บันทึกใช่ไหม',
  'unsaved.body': 'สิ่งที่พิมพ์ไว้และรูปที่เพิ่มในหน้านี้จะหายไป',
  'unsaved.stay': 'แก้ต่อ',
  'unsaved.leave': 'ออกโดยไม่บันทึก',
  'conflict.reload': 'โหลดเวอร์ชันล่าสุด',
  'archived.title': 'ความทรงจำที่พักไว้',
  'archived.item.deletable': 'พักไว้ครบ 7 วัน ลบถาวรได้แล้ว',
  'draft.title': 'ร่างความทรงจำใหม่',
  'draft.banner': 'เรื่องเล่าต้นฉบับยังอยู่ในถังขยะของฉัน ตรวจชื่อและวันที่ก่อนบันทึก',
  'forbidden.title': 'หน้านี้ยังเปิดดูไม่ได้',
  'pwa.install.body': 'เพิ่มไว้ที่หน้าจอหลัก เปิดความทรงจำได้ในแตะเดียว',

  // --- สถานะทั่วไป ---
  'common.cancel': 'ยกเลิก',
  'loading': 'กำลังโหลด',
  'loading.slow': 'ใช้เวลานานกว่าปกติ รออีกสักครู่',
  'retry': 'ลองใหม่',
  'back_home': 'กลับหน้าแรก',
  'page.not_found.title': 'ไม่พบหน้านี้',
  'page.not_found.body': 'ลิงก์อาจไม่ถูกต้อง หรือหน้านี้ถูกย้ายไปแล้ว',
  'pwa.update.body': 'มีเวอร์ชันใหม่พร้อมใช้',
  'pwa.update.action': 'อัปเดตเลย',
  'pwa.install.action': 'เพิ่มไว้ที่หน้าจอหลัก',

  // --- aria-label ของปุ่มไอคอนเดี่ยว ---
  'a11y.back': 'ย้อนกลับ',
  'a11y.more': 'ตัวเลือกเพิ่มเติม',
  'a11y.close': 'ปิด',
  'a11y.clear_search': 'ล้างคำค้น',
  'a11y.remove_photo': 'เอารูปนี้ออก',
  'a11y.add_photo': 'เพิ่มรูป',
  'a11y.member_more': 'ตัวเลือกของ {ชื่อ}',
  'a11y.memory_more': 'ตัวเลือกของความทรงจำ {ชื่อความทรงจำ}',
} as const;

export type CopyKey = keyof typeof copy;

const NAME_VAR_KEYS = new Set([
  'ชื่อ',
  'name',
  'ผู้ตอบ',
  'ชื่อความทรงจำ',
  'ชื่อครอบครัว',
  'ชื่อคนเริ่ม',
  'ชื่อเจ้าของ',
  'ชื่อผู้ดูแล',
  'ชื่อผู้ชวน',
  'ข้อความต้นของเรื่องเล่า',
  'actor_display_name',
  'event_title',
  'family_name',
]);

export const DISPLAY_NAME_MAX = 20;

export function truncateName(value: string, max = DISPLAY_NAME_MAX): string {
  if (value.length <= max) return value;
  if (max <= 1) return '…';
  return `${value.slice(0, max - 1)}…`;
}

export type InterpolateOptions = {
  /** Default true — list titles, meta, and toasts. Headings pass false. */
  truncateNames?: boolean;
};

export function interpolate(
  template: string,
  vars: Record<string, string>,
  options?: InterpolateOptions
): string {
  const truncateNames = options?.truncateNames !== false;
  return template.replace(/\{([^}]+)\}/g, (match, key: string) => {
    if (!Object.prototype.hasOwnProperty.call(vars, key)) return match;
    const value = vars[key];
    return truncateNames && NAME_VAR_KEYS.has(key) ? truncateName(value) : value;
  });
}

/** Page headings show the full name; CSS line-clamp handles overflow. */
export function interpolateHeading(template: string, vars: Record<string, string>): string {
  return interpolate(template, vars, { truncateNames: false });
}

/** h1 page titles: wrap up to 2 lines, then clamp. List/meta/toasts stay single-line … */
export const pageHeadingClassName = 'min-w-0 break-words line-clamp-2';

/** family.item.meta — hide {บทบาทของฉัน} unless the viewer is an admin. */
export function familyItemMeta(memberCount: number, isAdmin: boolean): string {
  const withRole = interpolate(copy['family.item.meta'], {
    จำนวน: String(memberCount),
    บทบาทของฉัน: isAdmin ? copy['members.role.admin'] : '',
  });
  return withRole.replace(/\s*·\s*$/u, '');
}
