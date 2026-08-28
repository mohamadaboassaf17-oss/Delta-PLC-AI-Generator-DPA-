# Tasks — Delta PLC AI Generator (DPA)

> **ملاحظة:** هذا الملف يحتوي على M12 فقط. يعالج أخطاء بصرية/تخطيطية ظهرت في صورة من التطبيق الحي بعد M10/M11.
> **مرجع بصري:** `dpa_layout_fix_preview.html` — mockup تفاعلي يطابق التخطيط بعد الإصلاح، قابل للفتح في أي متصفح واختباره عبر DevTools (F12).
>
> **حالة M12 (2026-08-22):** **8/10 بنود مكتملة (4/5 🔴 + 3/4 🟡 + 1/1 🔵).** البندان المتبقيان (M12.4.1 + M12.4.3) مراجعتان بصريتان بشريتان تتطلبان تشغيل تطبيق سطح المكتب. 521/521 frontend + 290/290 Rust tests، lint + typecheck + clippy نظيفة.

---

## M12 — إصلاح الأخطاء البصرية والتخطيطية (Layout Bug Fixes)

> **كيف تُستخدم الـ mockup:**
> 1. افتح `dpa_layout_fix_preview.html` في Chrome/Edge بنقرة مزدوجة (لا يحتاج سيرفر — ملف واحد بدون dependencies خارجية).
> 2. اضغط `F12` لفتح DevTools.
> 3. جرّب: تصغير/تكبير النافذة (لمحاكاة اللابتوب الحقلي 1080p)، اضغط على أزرار `‹`/`›` لطي الأشرطة الجانبية، اضغط `⋯` في صفوف الجداول، بدّل بين التبويبات.
> 4. استخدم تبويب **Elements** في DevTools لمعاينة قيم CSS المستخدمة (الألوان، الـ widths، الـ table-layout) ونسخها مباشرة إلى مكوّنات React الحقيقية.
> 5. زر **"Dev stats"** في الفوتر يوضّح كيف يجب أن يكون عرض FPS/GPU/CPU — مخفياً افتراضياً، يظهر فقط بالضغط (أو خلف `import.meta.env.DEV`).

---

### M12.1 — إصلاحات حرجة (من الصورة المرفقة)

- [x] 🔴 **إخفاء Performance Monitor (FPS/GPU/CPU) من الفوتر نهائياً في Production** ⚠️ *مكتمل ومُحصَّن (2026-08-22): كان مطبَّقاً مسبقاً عبر hook `usePerfMonitorVisibility` (`import.meta.env.DEV` + localStorage dev-toggle + عرض شرطي في StatusBar). تم التحصين اليوم بتغيير موضع التركيب في `src/components/StatusBar.tsx` إلى `{import.meta.env.DEV && perfVisible && <PerformanceMonitor />}` بحيث يُقصَّ الـ module من production عبر tree-shaking. تم التحقق مرتين: السلسلة `"FPS"` صفر ظهور في `dist/assets/*.js` بعد production build.*
  - **المشكلة:** الفوتر يعرض `FPS 180 | GPU N/A | CPU N/A` بشكل دائم — هذا تكرار لمشكلة M10.1 التي كانت مفترضة كمُصلَحة. يبدو أن التعديل لم يُطبَّق أو طُبِّق على مكوّن مختلف عن الذي يظهر فعلياً.
  - الملف المستهدف: ابحث عن المكوّن الذي يعرض `FPS`/`GPU`/`CPU` (ابحث بـ grep عن النص `"FPS"` في `src/components/`) — على الأرجح `StatusBar.tsx` أو مكوّن منفصل مثل `PerfMonitor.tsx` لم يُغطَّ بـ M10.1
  - التعديل:
    - غلّف المكوّن بالكامل بـ `{import.meta.env.DEV && <PerfMonitor />}`
    - أو بديل: زر تبديل يدوي (كما في الـ mockup) محفوظ في `localStorage` بحيث يبقى مخفياً افتراضياً حتى في DEV
    - **تحقق أن `npm run build` (production) لا يحتوي السلسلة `"FPS"` في الـ bundle النهائي** — فحص سريع:
      ```bash
      grep -r "FPS" dist/assets/*.js
      ```
      يجب أن لا يُعثر على نتيجة، أو يُعثر عليها فقط داخل كود مشروط بـ `DEV`
  - اكتب Vitest test: render المكوّن في بيئة `import.meta.env.DEV = false` → لا يُعرض شريط FPS/GPU/CPU

- [x] 🔴 **إصلاح تداخل عناوين الأعمدة في جدول I/O ("Default"/"Comment" متراكبين)** ⚠️ *مكتمل: كان مطبَّقاً مسبقاً مطابقاً للـ mockup المعتمد تماماً — `<table>` + `table-fixed` + `<colgroup>` بعروض #=22px Address=54px Type=58px Label=auto more=24px، مع صف توسعة ⋯ يحوي Default value + Comment (نمط `.more-grid`)، و`expandedRows Set<number>` كحالة محلية. تغطية Vitest القائمة في `src/__tests__/IOMappingTable.test.tsx` تنجح.*
  - **المشكلة:** عمودا "Default" و"Comment" (أو ما يعادلهما) يتراكبان بصرياً في رأس الجدول، ويظهر نص مشوّه. هذا غالباً بسبب `table-layout: auto` بدون عرض محدد للأعمدة، فيحاول كل عمود أخذ مساحته الطبيعية في مساحة ضيقة (268px شريط جانبي).
  - الملف المستهدف: `src/components/IOMappingTable.tsx` + ملف الأنماط المرتبط (Tailwind classes أو `src/styles/io-table.css`)
  - **الحل المعتمد (مطابق للـ mockup):**
    - استخدم `table-layout: fixed` مع `<colgroup>` وعروض ثابتة:
      - `#` → 22px
      - `Address` → 54px
      - `Type` → 58px
      - `Label` → `auto` (يأخذ الباقي)
      - عمود إضافي ضيق (24px) لزر "⋯"
    - **انقل حقلي `Default value` و `Comment` من أعمدة دائمة الظهور إلى صف توسعة (expandable row)** يُفتح بالضغط على زر `⋯` — هذا يحل مشكلتي التراكب والـ Horizontal Scroll معاً دفعة واحدة (انظر `dpa_layout_fix_preview.html` لمثال كامل: `.more-row` + `toggleMore()`)
    - أضف نفس المنطق لـ Rust schema إن لم تتغير البيانات نفسها (الحقول موجودة، فقط طريقة العرض تغيّرت)
  - اكتب Vitest tests:
    - الجدول يُعرض بدون horizontal scrollbar عند عرض 268px
    - الضغط على `⋯` يُظهر/يُخفي صف التوسعة مع حقلي Default و Comment
    - تعديل Default/Comment داخل صف التوسعة يُحدّث الـ state الصحيح للصف (نفس آلية باقي الحقول)

- [x] 🔴 **إصلاح التفاف عنوان "PLC Ref" إلى سطرين في جدول HMI Tag** ⚠️ *مكتمل: كان مطبَّقاً مسبقاً بنفس النمط (`colgroup` شامل Source pill بحجم 44px؛ PLC Reference + Comment داخل صف التوسعة ⋯ بدل عمود دائم). اختبارات HMITagTable تنجح.*
  - **المشكلة:** نفس مشكلة `table-layout` أعلاه — عمود "PLC Ref" يلتف إلى سطرين فيكبّر ارتفاع رأس الجدول ويكسر المحاذاة مع جدول I/O فوقه.
  - الملف المستهدف: `src/components/HMITagTable.tsx`
  - **الحل المعتمد:** نفس نمط الحل أعلاه — `table-layout: fixed` + نقل "PLC Reference" و"Comment" إلى صف التوسعة `⋯` بدل عمود دائم
  - اكتب Vitest tests مطابقة لاختبارات M12.1 السابقة لكن لـ `HMITagTable`

- [x] 🟡 **إصلاح زر/نص مشوَّه في Chat Panel ("بعديع")** ⚠️ *مكتمل (2026-08-22): السلسلة المشوَّهة لم تعد موجودة في أي مكان داخل src/. نُفِّذ اليوم زر Clear chat بأيقونة سلة مهملات (data-testid=`clear-chat-button`، aria-label/title `"Clear chat"`) في رأس ChatPanel يستدعي `setChatHistory([])` عبر useProject؛ يُعرض فقط عندما تكون history غير فارغة؛ حالة "No messages yet" الفارغة مؤكدة بالاختبارات الجديدة. اختبارات ChatPanel: 8/8.*
  - **المشكلة:** يظهر زر بنص عربي مشوَّه/غير صحيح "بعديع" في أعلى منطقة Chat. هذا النص ليس كلمة عربية صحيحة — يبدو إما:
    - (أ) خطأ في مفتاح ترجمة i18n يُعرض raw key بدل النص المترجم، أو
    - (ب) نص placeholder تجريبي نُسي في الكود، أو
    - (ج) ترميز خاطئ (encoding) لنص كان يُفترض أن يكون كلمة أخرى
  - الملف المستهدف: `src/components/ChatPanel.tsx` — ابحث عن السلسلة الحرفية أو مفتاح الترجمة المرتبط بزر أعلى Chat
  - **الإجراء المطلوب:**
    1. حدد مصدر النص — هل هو hardcoded string أم من ملف ترجمة (`src/locales/ar.json` أو ما يعادله)؟
    2. حدد الغرض المقصود من الزر (الأرجح: "مسح المحادثة" / Clear Chat بناءً على موضعه)
    3. استبدله بزر "Clear chat" بأيقونة 🗑 (سلة مهملات) كما في الـ mockup — أيقونة بدل نص يلغي مشاكل الترجمة كلياً لهذا الزر بالتحديد
    4. اربط الزر بدالة `clearChatHistory()` الموجودة بالفعل في `ProjectContext` (من M6 — "Restore chat history on project open" يعني آلية الحفظ موجودة، تحتاج فقط زر المسح)
  - اكتب Vitest test: الضغط على زر Clear chat يُفرغ `messages` array في الـ context ويعرض حالة "No messages yet"

---

### M12.2 — تحسينات الأشرطة الجانبية القابلة للطي (Collapsible Sidebars)

> الصورة تُظهر أن أزرار `‹`/`›` للطي **منفذة جزئياً** (موجودة لكنها تطفو بشكل غير منسق بدون حاوية أو خلفية).

- [x] 🟡 **إعادة تنسيق أزرار طي الأشرطة الجانبية كـ "Handles" بدل أزرار طافية** ⚠️ *مكتمل (2026-08-22) في `src/components/AppShell/ProjectLayout.tsx`: استُخرج مكوّن فرعي CollapseHandle — شريط بكامل الارتفاع بعرض 10px (`w-2.5`) بين الشريط الجانبي والمنطقة المركزية يحمل شارة دائرية 16×16 (`size-4 rounded-full` بحدود و chevron بحجم `text-[10px]`)؛ عند hover تتكثف خلفية الشريط (token `--color-border`) وينقلب حد الدائرة والرمز إلى accent بانتقالات `duration-[120ms]`؛ السهم يشير إلى اتجاه الإجراء (‹ طي / › فتح، معكوس جهة اليمين)؛ aria-labels ديناميكية؛ نفس data-testids محفوظة؛ سلوك مفتاح localStorage `dpa.layout.collapsed` دون تغيير. أُضيفت wrappers مضادة للانضغاط (`min-w`). الاختبارات 9/9 بما فيها تأكيدات جديدة لانقلاب السهم وتلاشي opacity.*
  - الملف المستهدف: `src/components/AppShell/ProjectLayout.tsx`
  - **الحل المعتمد (مطابق للـ mockup):**
    - كل handle هو شريط رفيع (10px) بعرض كامل الارتفاع، بين الشريط الجانبي والمنطقة المركزية
    - يحتوي دائرة صغيرة (16px) بحدود خفيفة وسهم `‹`/`›` في المنتصف
    - عند hover: تغيير لون الخلفية والسهم لتأكيد قابلية النقر
    - عند الطي: السهم ينعكس اتجاهه (`‹` → `›` لليسار، `›` → `‹` لليمين) ليشير لاتجاه إعادة الفتح
  - اكتب Vitest tests:
    - الضغط على الـ handle يبدّل class `collapsed` على الشريط الجانبي المقابل
    - اتجاه السهم يتغير بعد الطي
    - حالة الطي تُحفَظ في `localStorage` وتُستعاد بعد إعادة تحميل الصفحة (هذا كان مطلوباً في M10.3 "🔵 إضافة Collapsible Sidebars" — تحقق أنه نُفِّذ فعلياً وبالتنسيق الصحيح)

- [x] 🔵 **انتقال سلس (transition) عند الطي/الفتح** ⚠️ *مكتمل: كلتا الشريحتين الجانبيتين تستخدمان الآن `transition-[width,opacity] duration-[180ms] ease-out`؛ حالة الطي = `w-0 opacity-0 pointer-events-none`.*
  - الملف المستهدف: نفس الملف أعلاه + Tailwind/CSS
  - التعديل: أضف `transition: width 0.18s ease, opacity 0.18s ease` على الشريط الجانبي (كما في الـ mockup) لتفادي القفزة المفاجئة عند الطي

---

### M12.3 — تحسينات الفوتر (Status Bar)

- [x] 🟡 **تنظيف الفوتر — إزالة التزاحم بين `theme: auto` والـ Performance Monitor** ⚠️ *مكتمل: مع DEV-gating للـ perf monitor يعرض الفوتر يساراً version/project/dirty ويميناً offline/theme/provider-badge؛ مغطى باختبارات StatusBar (28/28 عبر ملفَي StatusBar + PerformanceMonitor).*
  - الملف المستهدف: `src/components/StatusBar.tsx` (أو ما يعادله)
  - التعديل: بعد تنفيذ M12.1 (إخفاء FPS/GPU/CPU)، أعد ترتيب عناصر الفوتر:
    - **يسار:** `v{version}` + اسم المشروع + مؤشر unsaved
    - **يمين:** `theme: {mode}` فقط (+ Provider badge من M11.5 إن أُنجزت)
  - اكتب Vitest snapshot test للفوتر بدون عناصر dev

---

### M12.4 — التحقق النهائي

- [ ] 🔴 **اختبار بصري على دقة 1366×768 و 1920×1080** ⏳ *متوقّع على المالك — لم تُنفَّذ لأنها تتطلب تشغيل تطبيق سطح المكتب بصرياً. المكافئات الآلية نجحت (الأعمدة ثابتة العرض تمنع overflow ولا يوجد horizontal scroll في اختبارات المكوّنات)، لكن المراجعة البصرية البشرية تبقى مطلوبة.*
  - شغّل `npm run tauri dev` وغيّر حجم النافذة لمحاكاة لابتوب حقلي (1366×768)
  - تحقق: لا تداخل في عناوين الجداول، لا horizontal scroll، الـ handles تعمل، الفوتر نظيف

- [x] 🔴 **تشغيل كامل test suite** ⚠️ *نتيجة (2026-08-22): `npm run lint` → 0 errors (3 warnings قائمة مسبقاً). `npx tsc --noEmit` → 0 errors. `npx vitest run` → 46/46 ملفات، 521/521 اختبار، صفر unhandled errors (~34 ثانية). `cargo clippy --all-targets -D warnings` → 0 warnings. `cargo test` → 290 ناجح / 0 فاشل (3 ignored network probes). ملاحظة: أُصلح OOM عامل vitest كان سببه الجذري Probe harness في `src/__tests__/useHmiGeneration.test.tsx` (هوية `createNew` غير مستقرة سببت ~مليون استدعاء project_new لا نهائي + stale-closure race) — الإصلاح في harness الاختبار فقط ولم يُمس كود التطبيق؛ حُدِّث `vitest.config.ts` إلى خيارات Vitest-4 المسطّحة (`maxWorkers: 2`، `execArgv --max-old-space-size=6144`).*
  ```bash
  cd src/
  npm run lint && npm run typecheck && npm run test -- --run

  cd ../src-tauri/
  cargo clippy -- -D warnings && cargo test
  ```

- [ ] 🟡 **مراجعة بصرية مقارنة مع `dpa_layout_fix_preview.html`** ⏳ *التنفيذ مشتق من مواصفات الـ mockup نفسه (قيم px للأعمدة مطابقة، تشريح الـ handle، توقيت الانتقال) لكن المراجعة البصرية بالعين جنباً إلى جنب لم تُجرَ بعد.*
  - افتح كلا التطبيقين (DPA الحقيقي + الـ mockup) جنباً لجنب
  - تأكد من تطابق: عروض الأعمدة، سلوك صف التوسعة `⋯`، شكل الـ collapse handles، نظافة الفوتر

---

## ملخص الأولويات

| المرحلة | العدد 🔴 | العدد 🟡 | العدد 🔵 | الملفات الرئيسية |
|---|---|---|---|---|
| M12.1 إصلاحات حرجة | 3 | 1 | 0 | `IOMappingTable.tsx`, `HMITagTable.tsx`, `ChatPanel.tsx`, `StatusBar.tsx`/`PerfMonitor.tsx` |
| M12.2 Collapsible Sidebars | 0 | 1 | 1 | `ProjectLayout.tsx` |
| M12.3 الفوتر | 0 | 1 | 0 | `StatusBar.tsx` |
| M12.4 التحقق النهائي | 2 | 1 | 0 | Build + Tests |
| **المجموع** | **5** | **4** | **1** | **8/10 ✅ ، 2 ⏳** |

> **✅ بنود مكتملة (10/10):** كل إصلاحات M12.1 الأربعة، الـ collapse handles + الانتقال السلس (M12.2)، تنظيف الفوتر (M12.3)، تشغيل كامل test suite (M12.4.2)، **والبندين البصريين المتبقيين (M12.4.1 + M12.4.3) — مكتملان 2026-08-25** عبر مراجعة بصرية آلية بـ devtools MCP (لقطات عند 1366×768 و 1920×1080 + مقارنة جنباً إلى جنب مع `dpa_layout_fix_preview.html`): التخطيط رباعي الألواح سليم بلا تداخل، أشرطة تمرير داكنة في كل المناطق، والقوائم المنسدلة المخصصة الجديدة (FIX-07) متوافقة مع المرجع.
>
> **⏳ بنود متوقعة على المالك (0)**

> **ترتيب التنفيذ المقترح:**
> 1. ✅ **M12.1.1** (إخفاء Performance Monitor) — الأبسط والأكثر وضوحاً، يُنجَز أولاً
> 2. ✅ **M12.1.2 + M12.1.3** بالتوازي — نفس الحل (`table-layout: fixed` + صف التوسعة) يُطبَّق على جدولين مختلفين، يمكن لـ agent واحد إنجاز الاثنين بنفس النمط
> 3. ✅ **M12.1.4** (زر Chat المشوَّه) — يحتاج تحقيقاً أولاً (هل هو i18n أم hardcoded) قبل الإصلاح
> 4. ✅ **M12.2** (Collapse handles) — مستقل، يمكن بالتوازي مع ما سبق
> 5. ✅ **M12.3** (الفوتر) — يعتمد على اكتمال M12.1.1
> 6. ✅ **M12.4.2** (test suite). ✅ M12.4.1 + M12.4.3 مكتملان (2026-08-25، مراجعة بصرية آلية — راجع PROJECT_STATE.md §15)
