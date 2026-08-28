<!-- ARCHIVED 2026-08-29 — Legacy M10 (tasks(1).md) superseded by canonical tasks.md M1–M11. Kept for project history only. Do not update. Canonical source: tasks.md + PROJECT_STATE.md (Single Source of Truth). Original path: tasks(1).md -->

# Tasks — Delta PLC AI Generator (DPA) — LEGACY M10 (superseded)

> **ملاحظة:** هذا الملف **legacy** يحتوي على M10 فقط (التقسيم القديم قبل `tasks.md` الجديد M1–M11). **M0–M9 مكتملة** في التقسيم القديم و**M1–M6 مكتملة** في `tasks.md` الحالي (2026-08-28). احتُفظ بهذا الملف للتاريخ فقط — المصدر القانوني الحالي هو `tasks.md` (و `PROJECT_STATE.md` كـ Single Source of Truth). لا تُحدَّث checklist هنا بعد 2026-08-28.

---

## M10 — UI Polish, UX Fixes & Security Audit

> **الهدف:** معالجة كل المشاكل المكتشفة في مراجعة UI/UX بعد رؤية التطبيق الحي، بالإضافة إلى إجراء اختبار أمني شامل للمشروع قبل الإطلاق العام.
>
> **الأولوية:** المهام المحددة بـ 🔴 يجب إنجازها قبل أي إطلاق. المهام بـ 🟡 مهمة لكن لا تمنع الإطلاق. المهام بـ 🔵 تحسينات تجربة.

---

### M10.1 — إصلاحات عاجلة قبل الإطلاق (Critical Blockers)

- [ ] 🔴 **حذف milestone label من Welcome Screen** — إزالة نص `• M1` من شاشة الترحيب (يظهر حالياً `V0.1.0 • M1`). المستخدم النهائي لا يعرف ما هو M1.
  - الملف المستهدف: `src/components/WelcomeScreen.tsx`
  - التعديل: استبدل `V0.1.0 • M1` بـ `v0.1.0`

- [ ] 🔴 **إخفاء Performance Monitor في Production build** — شريط `FPS N/A N/A | GPU 4% 34°C | CPU 14%` ظاهر للمستخدم النهائي وغير مناسب.
  - الملف المستهدف: المكوّن الذي يعرض هذا الشريط (على الأرجح في `AppShell.tsx` أو `TitleBar`)
  - التعديل: اجعله يظهر فقط عند `import.meta.env.DEV === true` أو عند تفعيل `Ctrl+Shift+D`
  - أضف Vitest test للتحقق أن المكوّن لا يُعرض في `NODE_ENV=production`

- [ ] 🔴 **إضافة زر Test Connection في Settings Panel** — حالياً المستخدم يحفظ المفتاح ثم يكتشف خطأه عند أول توليد.
  - الملف المستهدف: `src/components/SettingsPanel.tsx` (أو ما يعادله)
  - التعديل: أضف زر `Test Connection` مجاور لحقل Model يستدعي `generate_code` بـ prompt فارغ ويعيد ✅ أو ❌
  - اكتب Vitest test للـ loading state وكلا حالتي النجاح والفشل

- [ ] 🔴 **إضافة Default Model تلقائياً بناءً على Provider** — المستخدم يفتح مشروعاً جديداً ويجد `Select a model...` فارغاً بدون قيمة.
  - الملف المستهدف: `src/components/SettingsPanel.tsx` + `src/lib/api.ts` (أو ما يعادله)
  - التعديل: عند اختيار Provider، عيّن تلقائياً:
    - OpenAI → `gpt-4o`
    - Anthropic → `claude-sonnet-4-6`
  - أضف validation في زر Generate: إذا لم يكن هناك Model محدد، أظهر toast error بدل الإرسال
  - اكتب Vitest test لمنطق الـ default model selection

---

### M10.2 — إصلاحات UX الهيكلية (High Priority)

- [ ] 🔴 **تحويل ST / LD / IL من Split إلى Tabs مع زر Maximize** — الأعمدة الثلاثة الحالية تعطي كل نافذة ~300px على شاشة 1080p — ضيق جداً لقراءة الـ Ladder Diagram.
  - الملف المستهدف: `src/components/CodeGenerationPanel.tsx`
  - التعديل:
    - استبدل Split layout بـ Tab bar: `[ Structured Text ]  [ Ladder Diagram ]  [ Instruction List ]`
    - أضف زر `⤢ Maximize` للـ LD Tab يفتحه في modal/overlay بملء الشاشة
    - احفظ الـ active tab في local state (لا يحتاج persist في `.dpa`)
  - اكتب Vitest tests لـ:
    - Tab switching يعرض الـ panel الصحيح
    - Maximize button يفتح الـ overlay
    - Keyboard shortcut `Escape` يغلق الـ overlay

- [ ] 🔴 **إصلاح Conflict Resolution — لا تفتح Chat Panel تلقائياً** — الفتح التلقائي للنوافذ سلوك مزعج (intrusive UX) في بيئة العمل الصناعية.
  - الملف المستهدف: `src/components/AIReviewPanel.tsx` أو `src/hooks/useConflictDetection.ts`
  - التعديل:
    - احذف السلوك الذي يفتح Chat Panel تلقائياً عند التعارض
    - استبدله بـ banner أحمر أعلى منطقة الكود: `⚠ تم اكتشاف 3 تعارضات في العناوين — [عرض التفاصيل]`
    - زر "عرض التفاصيل" هو الذي يفتح Chat Panel عند الضغط عليه
    - لوّن الأسطر المتعارضة في ST panel باللون الأحمر كما هو مخطط
  - اكتب Vitest tests للـ banner rendering وعدد التعارضات

- [ ] 🟡 **إضافة BYOK Banner على Welcome Screen عند غياب API Key** — الحالي: رابط نصي صغير `Skip to Settings →`. المطلوب: banner واضح لا يمكن تجاهله.
  - الملف المستهدف: `src/components/WelcomeScreen.tsx`
  - التعديل:
    - عند `hasApiKey === false`، أظهر banner أصفر في أعلى الشاشة:
      `⚠ لم يتم إعداد مفتاح API — التطبيق لن يعمل بدونه.  [إعداد المفتاح الآن →]`
    - الزر يفتح BYOK Wizard مباشرة
    - احتفظ بـ `Skip to Settings →` كخيار ثانوي أقل بروزاً
  - اكتب Vitest test: banner يظهر عند `hasApiKey=false` ويختفي عند `hasApiKey=true`

---

### M10.3 — إصلاحات جدول I/O (I/O Table Fixes)

- [ ] 🔴 **Octal Address Validator لعناوين Delta DVP** — Delta DVP تستخدم النظام الثماني (Octal): X0–X7 ثم X10 (وليس X8). كتابة X8 أو X9 يجب أن تُرفض فوراً.
  - الملف المستهدف: `src/components/IOMappingTable.tsx` + `src-tauri/src/commands/io_table.rs`
  - التعديل في Frontend:
    - أضف inline validator على حقل Address يرفض الأرقام الثمانية غير الصالحة (8، 9 في أي خانة)
    - الأنماط المقبولة: `X0-X7`, `X10-X17`, `X20-X27`... إلخ (octal)
    - رسالة خطأ: `"X8 غير صالح — Delta DVP تستخدم النظام الثماني. العنوان التالي بعد X7 هو X10"`
  - التعديل في Backend (Rust):
    - أضف `validate_dvp_address(addr: &str) -> Result<(), AddressError>` في `src-tauri/src/commands/io_table.rs`
    - نفس المنطق على مستوى الـ Tauri command كطبقة أمان ثانية
  - اكتب Vitest tests:
    - `X0`–`X7` → valid
    - `X8`, `X9` → invalid مع الرسالة الصحيحة
    - `X10`–`X17` → valid
    - `Y8`, `Y9` → invalid
  - اكتب Rust unit tests لـ `validate_dvp_address` بنفس الحالات

- [ ] 🟡 **إصلاح عرض الأعمدة في جدول I/O — تقليل Horizontal Scroll** — عمود Address وعمود Type ضيقان ويسببان Scrollbar أفقياً يخفي عمود Label.
  - الملف المستهدف: `src/components/IOMappingTable.tsx`
  - التعديل:
    - حدد عرض عمود `#`: 30px fixed
    - حدد عرض عمود `Address`: 60px fixed
    - حدد عرض عمود `Type`: 70px fixed
    - دع عمود `Label` يأخذ المساحة المتبقية (`flex: 1`)
    - أضف عمود `Delete` (أيقونة فقط): 32px fixed في اليمين
  - اكتب Vitest snapshot test للـ column widths

- [ ] 🟡 **حفظ واستعادة نص الوصف في صندوق الـ Description بشكل صحيح** — من الصور يبدو أن نصاً قديماً (`asfhoi`) يبقى في الحقل عند فتح مشروع.
  - الملف المستهدف: `src/components/CodeGenerationPanel.tsx` + `src/context/ProjectContext.tsx`
  - التعديل: تحقق أن `description` يُحمَّل من `.dpa` عند فتح المشروع ويُمسح عند `New Project`
  - اكتب Vitest test: فتح مشروع محفوظ يستعيد الـ description الصحيح

- [ ] 🔵 **إضافة Collapsible Sidebars** — زر طي الشريط الجانبي الأيسر والأيمن لمنح مساحة أوسع لمنطقة الكود.
  - الملف المستهدف: `src/components/AppShell/ProjectLayout.tsx`
  - التعديل:
    - أضف زر `‹` على الحافة اليمنى للشريط الأيسر لطيه إلى 0px
    - أضف زر `›` على الحافة اليسرى للشريط الأيمن لطيه إلى 0px
    - احفظ حالة الطي في localStorage (تستمر بين الجلسات)
  - اكتب Vitest test لـ toggle behavior

---

### M10.4 — إصلاحات Settings Panel

- [ ] 🟡 **تحذير Temperature Slider عند القيم العالية** — القيم أعلى من 0.3 تنتج كوداً PLC غير دقيق وخطير.
  - الملف المستهدف: `src/components/SettingsPanel.tsx`
  - التعديل:
    - أضف نص تحذيري تحت السلايدر يظهر ديناميكياً عند `temperature > 0.3`:
      `⚠ قيم أعلى من 0.3 قد تنتج كوداً غير دقيق في بيئات الـ PLC الصناعية`
    - لوّن التحذير بالأصفر عند 0.3–0.6 وبالأحمر عند > 0.6
    - حدد الحد الأقصى المسموح به بـ 0.7 (لا تسمح بـ 1.0 في هذا التطبيق)
  - اكتب Vitest tests لظهور التحذير عند القيم الصحيحة

- [ ] 🔵 **تحسين BYOK Wizard — إضافة صور توضيحية للخطوات** — الـ Wizard الحالي يحتوي نصاً وروابط فقط. إضافة screenshots مصغرة لكل خطوة تقلل Drop-off.
  - الملف المستهدف: `src/components/ByokWizard.tsx` (أو ما يعادله)
  - التعديل: أضف `<img>` أو SVG placeholder لكل خطوة يشير للمكان الصحيح في موقع Anthropic/OpenAI
  - الصور تُخزّن في `src/assets/wizard/` كـ static assets

---

### M10.5 — وثائق المشروع (Documentation Updates)

- [ ] 🟡 **تحديث `AGENTS.md` — إضافة قواعد Octal Validator** — توثيق أن جميع I/O addresses يجب أن تمر عبر `validate_dvp_address` قبل الاستخدام.
  - الملف المستهدف: `AGENTS.md`
  - الإضافة في قسم "Key Patterns":
    ```
    - **DVP Address Validation**: All I/O addresses must pass `validate_dvp_address()` (Rust)
      before any use. Delta DVP uses octal numbering — X8/X9/Y8/Y9 are invalid.
      Frontend also validates inline; Rust validation is the authoritative layer.
    ```

- [ ] 🟡 **تحديث `AGENTS.md` — توثيق قاعدة Performance Monitor** — إضافة قاعدة صريحة أن أي debug UI يجب أن يكون مشروطاً بـ `DEV` mode.
  - الملف المستهدف: `AGENTS.md`
  - الإضافة في قسم "Code Style → TypeScript / React":
    ```
    - **Debug UI**: Any performance monitors, debug panels, or dev-only overlays must be
      conditionally rendered: `{import.meta.env.DEV && <DebugPanel />}`. Never render
      debug UI in production builds.
    ```

- [ ] 🔵 **تحديث `README.md`** — الـ README الحالي هو template فارغ من Tauri. استبدله بـ README حقيقي للمشروع.
  - الملف المستهدف: `README.md`
  - المحتوى المطلوب:
    - وصف المشروع بجملتين
    - متطلبات التشغيل (Windows 10/11 64-bit، WebView2)
    - خطوات التثبيت (تنزيل MSI/NSIS من Releases)
    - خطوات البناء من المصدر (للمطورين)
    - رابط للـ `DPA_PRD.md` لمن يريد التفاصيل
    - رابط لـ `AGENTS.md` للمساهمين

- [ ] 🔵 **تحديث `DPA_PRD.md` — توثيق قرار Tabs بدل Split** — المستند يذكر "شاشة مقسمة" لـ ST/LD لكن القرار الآن هو Tabs.
  - الملف المستهدف: `DPA_PRD.md`
  - التعديل في القسم 6.2: استبدل "كود ST (يسار) \| Ladder Diagram (يمين)" بـ "تبويبات: ST \| LD \| IL مع زر Maximize للـ LD"

---

### M10.6 — الاختبار الأمني الشامل (Security Audit)

> **السياق:** التطبيق يتعامل مع مفاتيح API حساسة، يقرأ/يكتب ملفات محلية، ويرسل بيانات المصانع لخوادم خارجية. أي ثغرة أمنية يمكن أن تعرّض أسرار الصناعة أو تتيح تنفيذ كود خبيث.

#### M10.6.1 — أمان مفتاح API

- [ ] 🔴 **تدقيق: API Key لا يُسجَّل في أي مكان (No Logging)**
  - ابحث في كل الكود عن `println!`, `log::info!`, `log::debug!`, `console.log`, `console.error` وتحقق أن لا واحداً منها يطبع متغيراً قد يحتوي المفتاح
  - ابحث بـ regex: `(api_key|apiKey|API_KEY|key|token)` في سياق logging
  - اكتب Rust test يتحقق أن `#[tauri::command] save_api_key` لا يُعيد المفتاح في response body

- [ ] 🔴 **تدقيق: API Key لا يُرسَل في Headers إلا للـ Provider المحدد**
  - راجع `src-tauri/src/commands/` — تحقق أن `Authorization: Bearer {key}` يُرسَل فقط لـ `api.openai.com` أو `api.anthropic.com` — لا لأي URL آخر
  - اكتب Rust test: إذا كان `provider_url` لا يطابق الـ allowlist، يُرفض الطلب

- [ ] 🔴 **تدقيق: API Key في OS Keychain — لا يُخزَّن في plain text**
  - تحقق في `src-tauri/src/commands/settings.rs` (أو ما يعادله) أن الحفظ يتم عبر `keyring` crate أو `tauri-plugin-keychain` وليس عبر `fs::write` لملف نصي
  - اكتب Rust test: `get_api_key()` يُعيد `None` إذا لم يُخزَّن شيء (لا يقرأ من مكان غير Keychain)

- [ ] 🔴 **تدقيق: حقل API Key مخفي في الـ UI (Masked Input)**
  - تحقق أن `<input type="password">` أو ما يعادله مستخدم لحقل المفتاح
  - تحقق أن قيمة المفتاح لا تُرسَل للـ React state بشكل مكشوف (يجب أن تبقى في Tauri backend)
  - اكتب Vitest test: الـ input field يكون `type="password"` وليس `type="text"`

#### M10.6.2 — أمان ملفات المشروع (.dpa)

- [ ] 🔴 **تدقيق: التحقق من امتداد الملف قبل Deserialization**
  - راجع `src-tauri/src/commands/project.rs` — تحقق أن كل `open_project` تحقق من امتداد `.dpa` قبل `serde_json::from_str`
  - اكتب Rust test: محاولة فتح ملف `.json` أو `.exe` تُعيد `Err(InvalidFileType)`

- [ ] 🔴 **تدقيق: التحقق من `version` field في `.dpa` قبل المعالجة**
  - تحقق أن الكود يرفض أي ملف بـ `version > 2` أو `version < 1` برسالة خطأ واضحة
  - اكتب Rust test: ملف بـ `version: 99` يُعيد `Err(UnsupportedSchemaVersion)`

- [ ] 🔴 **تدقيق: Path Traversal Protection في Tauri commands**
  - راجع كل الأماكن التي يُستقبَل فيها `path: String` من frontend
  - تحقق أن `tauri::api::path::resolve` أو ما يعادله يُستخدم لمنع `../../../etc/passwd` style attacks
  - اكتب Rust test: مسار يحتوي على `..` يُعيد `Err(InvalidPath)`

- [ ] 🟡 **تدقيق: حجم ملف .dpa — الحد الأقصى**
  - أضف حداً أقصى لحجم الملف عند الفتح (مثلاً 50 MB) لمنع هجمات DoS عبر ملفات ضخمة
  - اكتب Rust test: ملف > 50 MB يُعيد `Err(FileTooLarge)`

- [ ] 🟡 **تدقيق: JSON Deserialization — منع Billion Laughs Attack**
  - تحقق أن الـ `serde_json` deserializer يستخدم `max_depth` أو أن البنية محدودة العمق
  - أضف Rust test: JSON عميق بشكل مفرط (> 100 مستوى تداخل) يُعيد Error

#### M10.6.3 — أمان الشبكة والـ API

- [ ] 🔴 **تدقيق: Tauri CSP (Content Security Policy)**
  - راجع `src-tauri/tauri.conf.json` — تحقق من وجود `"csp"` policy في قسم `security`
  - الحد الأدنى المقبول: `"default-src 'self'; connect-src 'self' https://api.openai.com https://api.anthropic.com; img-src 'self' data:; script-src 'self'"`
  - لا يجب أن يكون هناك `unsafe-inline` أو `unsafe-eval` في الـ CSP

- [ ] 🔴 **تدقيق: Tauri `dangerousRemoteDomainIpcAccess` معطّل**
  - تحقق في `tauri.conf.json` أن `dangerousRemoteDomainIpcAccess` غير موجود أو `false`
  - هذا يمنع أي موقع ويب خارجي من استدعاء Tauri IPC commands

- [ ] 🔴 **تدقيق: Tauri allowlist — تقييد الـ commands المتاحة**
  - راجع `tauri.conf.json` في قسم `plugins` أو `allowlist`
  - كل command يجب أن يكون في allowlist صريحة — لا wildcard `*`
  - filesystem access يجب أن يكون محدوداً بـ `$APPDATA` و `$DOCUMENT` فقط

- [ ] 🔴 **تدقيق: HTTPS Only للـ API Calls**
  - ابحث في Rust code عن أي `http://` (بدون S) في URLs
  - كل الاتصالات بـ OpenAI/Anthropic يجب أن تكون `https://`

- [ ] 🟡 **تدقيق: Request Timeout محدد للـ API Calls**
  - تحقق أن كل HTTP request للـ AI APIs له timeout محدد (يُقترح 60 ثانية)
  - بدون timeout، طلب API معلّق يجمّد الـ UI إلى الأبد
  - اكتب Rust test: request يتجاوز timeout يُعيد `Err(RequestTimeout)`

- [ ] 🟡 **تدقيق: لا يوجد Prompt Injection من ملف .dpa**
  - تحقق أن نص الـ `description` والـ labels في جدول I/O يُعقَّم (sanitized) قبل إدراجه في الـ prompt
  - بشكل خاص: أحرف مثل `"""`, `\n---\n`, `<system>` يمكنها تجاوز الـ prompt template
  - أضف `sanitize_prompt_input(input: &str) -> String` في `src-tauri/src/lib/prompts/`
  - اكتب Rust tests لحالات: نص عادي (لا تغيير)، نص بـ `"""` (تُزال)، نص بـ `<system>` (تُزال)

#### M10.6.4 — أمان الكود المولّد

- [ ] 🟡 **تدقيق: الكود المولّد لا يُنفَّذ محلياً**
  - تحقق أن الكود ST/IL/LD يُعرض فقط كنص — لا يوجد أي `eval()`, `exec()`, أو dynamic code execution
  - ابحث في Frontend code عن `eval(`, `new Function(`, `innerHTML =` مع محتوى ديناميكي

- [ ] 🟡 **تدقيق: XML Export — منع XXE (XML External Entity)**
  - راجع `src-tauri/src/commands/export.rs` — تحقق أن XML builder لا يقبل external entities
  - إذا كنت تستخدم `quick-xml` crate، تحقق أن الـ parser في strict mode

#### M10.6.5 — أمان الـ Build والـ Dependencies

- [ ] 🔴 **فحص `cargo audit` — كشف Dependencies ذات ثغرات معروفة**
  ```bash
  cargo install cargo-audit
  cargo audit
  ```
  - أصلح أي ثغرة بمستوى `critical` أو `high` قبل الإطلاق
  - وثّق أي ثغرة `medium` مقبولة مع مبرر

- [ ] 🔴 **فحص `npm audit` — كشف Frontend Dependencies ذات ثغرات**
  ```bash
  cd src/
  npm audit --audit-level=high
  ```
  - أصلح أي ثغرة بمستوى `high` أو `critical`
  - شغّل `npm audit fix` للإصلاح التلقائي حيث أمكن

- [ ] 🟡 **تدقيق: No Hardcoded Secrets في الكود**
  - ابحث في كامل المشروع عن أي API keys أو tokens مُضمَّنة:
    ```bash
    grep -r "sk-" src/ src-tauri/
    grep -r "anthropic" src/ --include="*.ts" -i | grep -v "import\|comment\|url"
    grep -r "Bearer" src/ src-tauri/
    ```
  - تحقق أن `.gitignore` يشمل أي ملفات `.env` أو ملفات secrets

- [ ] 🟡 **تدقيق: Tauri Bundle لا يشمل dev dependencies**
  - تحقق بعد `cargo tauri build` أن الملف الناتج لا يحتوي source maps أو debug symbols مكشوفة
  - تحقق أن `[profile.release]` في `Cargo.toml` يحتوي `strip = true` أو ما يعادله

#### M10.6.6 — اختبارات الاختراق اليدوية (Manual Penetration Tests)

- [ ] 🟡 **اختبار: ماذا يحدث عند توفير ملف .dpa مشوَّه (Malformed JSON)**
  - أنشئ ملفاً بامتداد `.dpa` يحتوي JSON غير صالح وحاول فتحه
  - التوقع: رسالة خطأ واضحة بدون crash

- [ ] 🟡 **اختبار: ماذا يحدث عند توفير ملف .dpa بـ payload ضخم في حقل description**
  - أنشئ `.dpa` بـ description طوله 10 MB وحاول فتحه وتوليد الكود
  - التوقع: error مناسب أو truncation واضح للمستخدم

- [ ] 🟡 **اختبار: ماذا يحدث عند إدخال أحرف خاصة في حقل Label بجدول I/O**
  - جرّب: `"; DROP TABLE--`, `<script>alert(1)</script>`, `../../../`
  - التوقع: تُعرض كنص حرفي في الكود المولّد بدون تأثير

- [ ] 🟡 **اختبار: ماذا يحدث عند تعديل API Key في Keychain خارج التطبيق**
  - استخدم Windows Credential Manager لتعديل المفتاح المحفوظ يدوياً
  - شغّل التطبيق وحاول التوليد
  - التوقع: رسالة خطأ واضحة "مفتاح API غير صالح" بدون crash

---

### M10.7 — التحقق النهائي (Final Verification)

- [ ] 🔴 **تشغيل كامل test suite بعد كل تعديلات M10**
  ```bash
  cd src/
  npm run lint && npm run typecheck && npm run test -- --run

  cd ../src-tauri/
  cargo clippy -- -D warnings && cargo test && cargo audit
  ```
  - الهدف: 0 errors, 0 new warnings, كل الاختبارات الجديدة تمر

- [ ] 🔴 **التحقق من حجم Bundle بعد التعديلات**
  ```bash
  npm run tauri build
  ```
  - تحقق أن ملف `.msi` لا يزال ≤ 20 MB بعد إضافة الـ assets الجديدة (wizard images)

- [ ] 🔴 **إعادة تشغيل M9.6 Checklist** — بعد كل تعديلات M10، أعد اختبار Clean Windows بالـ checklist الكامل لـ M9.6

---

## ملخص الأولويات

| المرحلة | العدد 🔴 | العدد 🟡 | العدد 🔵 | الملفات الرئيسية |
|---|---|---|---|---|
| M10.1 Critical Blockers | 4 | 0 | 0 | `WelcomeScreen`, `AppShell`, `SettingsPanel` |
| M10.2 UX Structural | 2 | 1 | 0 | `CodeGenerationPanel`, `ProjectLayout` |
| M10.3 I/O Table | 1 | 2 | 1 | `IOMappingTable`, `io_table.rs` |
| M10.4 Settings | 0 | 1 | 1 | `SettingsPanel`, `ByokWizard` |
| M10.5 Docs | 0 | 2 | 2 | `AGENTS.md`, `README.md`, `DPA_PRD.md` |
| M10.6 Security | 10 | 12 | 0 | جميع الملفات |
| M10.7 Verification | 3 | 0 | 0 | Build + Tests |
| **المجموع** | **20** | **18** | **4** | |

> **ترتيب التنفيذ المقترح:**
> 1. M10.6.5 أولاً (cargo audit + npm audit) — قد تكتشف مشاكل تؤثر على قرارات أخرى
> 2. M10.1 (Critical Blockers) — موازياً
> 3. M10.6.1 + M10.6.2 + M10.6.3 (Security) — موازياً
> 4. M10.2 + M10.3 (UX + I/O)
> 5. M10.4 + M10.5 (Settings + Docs)
> 6. M10.6.4 + M10.6.6 (Code + Penetration Tests)
> 7. M10.7 (Final Verification)
