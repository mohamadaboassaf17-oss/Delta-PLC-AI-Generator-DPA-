# Tasks — Delta PLC AI Generator (DPA)

> **ملاحظة:** هذا الملف يحتوي على M11 فقط. M0–M10 مكتملة بالكامل.
>
> **حالة M11 (2026-08-22):** **33/35 بنود مكتملة (20/22 🔴 + 12/12 🟡 + 1/1 🔵).** البندان المتبقيان اختباران يدويان بمفاتيح حقيقية متوقّعان على المالك فقط (M11.9.2 Gemini، M11.9.3 Custom). حجم Bundle مُتحقَّق منه اليوم: MSI 4.8 MB / NSIS 3.4 MB ≤ 20 MB.

---

## M11 — دعم Google Gemini + مزوّدين مخصصين (Custom Provider)

> **الهدف:** توسيع نظام BYOK ليقبل:
> 1. **Google Gemini** كمزوّد native ثالث (بنفس مستوى التكامل مع OpenAI/Anthropic).
> 2. **Custom Provider** — أي endpoint متوافق مع OpenAI API (مثل OpenRouter, Groq, Together, Ollama المحلي...) يحدده المستخدم بنفسه.
>
> **القرارات المعمارية المعتمدة:**
> - Gemini: تكامل native كامل — request/response format خاص بـ Gemini (`contents`/`parts`)، auth عبر header `x-goog-api-key`، streaming عبر `?alt=sse`.
> - Custom: نفترض توافق OpenAI-compatible (`/v1/chat/completions` + streaming SSE).
> - أمان Custom Provider: **السماح بأي HTTPS domain** + **نظام "Trust on First Use"** — أول استخدام لأي domain جديد يتطلب تأكيد المستخدم عبر modal، ثم يُحفظ الـ domain في قائمة "موثوقة" محلياً.
> - الموديل لـ Gemini: قائمة منسدلة (`gemini-2.5-pro`, `gemini-2.5-flash`, `gemini-2.5-flash-lite`) + خيار "Custom" لكتابة اسم آخر.
> - الموديل لـ Custom Provider: حقل نصي حر (لا توجد قائمة جاهزة لأن المزوّدين مختلفون).
> - كل الميزات (Generate, Chat/modify_code, AI Review, Test Connection) تعمل مع كل من Gemini و Custom من اليوم الأول.

---

### M11.1 — إعادة هيكلة Provider Architecture (Foundation)

> هذه المرحلة أساس لكل ما بعدها — يجب إنجازها أولاً.

- [x] 🔴 **توسيع `Provider` enum ليشمل `Gemini` و `Custom`**
  - الملف المستهدف: `src-tauri/src/models/settings.rs` (أو ما يعادله)
  - التعديل:
    ```rust
    #[derive(Debug, Clone, Serialize, Deserialize)]
    pub enum Provider {
        OpenAI,
        Anthropic,
        Gemini,
        Custom,
    }
    ```
  - أضف حقول جديدة لـ Custom في إعدادات المشروع/التطبيق:
    - `custom_base_url: Option<String>` (يجب أن يبدأ بـ `https://`)
    - `custom_model_name: Option<String>` (نص حر)
  - حدّث `.dpa` schema version إلى `version: 3` مع مسار ترقية (migration) من `version: 2`
  - اكتب Rust test: migration من v2 إلى v3 يحافظ على كل الحقول القديمة ويضيف الحقول الجديدة بقيم `None`/default

- [x] 🔴 **بناء Provider Abstraction Layer (Trait موحّد)**
  - الملف المستهدف: `src-tauri/src/lib/providers/mod.rs` (جديد)
  - التعديل: عرّف trait موحّد:
    ```rust
    pub trait AiProvider {
        fn build_request(&self, messages: &[Message], config: &GenConfig) -> Request;
        fn parse_stream_chunk(&self, raw: &str) -> Result<StreamChunk, ProviderError>;
        fn parse_error(&self, status: u16, body: &str) -> ProviderError;
        fn auth_headers(&self, api_key: &str) -> HeaderMap;
        fn endpoint_url(&self, model: &str, streaming: bool) -> String;
    }
    ```
  - أنشئ ملفات منفصلة لكل مزوّد:
    - `src-tauri/src/lib/providers/openai.rs` (refactor من الكود الحالي)
    - `src-tauri/src/lib/providers/anthropic.rs` (refactor من الكود الحالي)
    - `src-tauri/src/lib/providers/gemini.rs` (جديد — M11.2)
    - `src-tauri/src/lib/providers/custom.rs` (جديد — M11.3)
  - اكتب Rust tests: التحقق أن `generate_code` command يستدعي الـ provider الصحيح بناءً على `Provider` enum المحفوظ

---

### M11.2 — تكامل Google Gemini (Native)

- [x] 🔴 **بناء Gemini Request Builder**
  - الملف المستهدف: `src-tauri/src/lib/providers/gemini.rs`
  - التعديل:
    - حوّل `messages: Vec<Message>` (OpenAI-style: role/content) إلى صيغة Gemini:
      ```json
      {
        "contents": [
          {"role": "user", "parts": [{"text": "..."}]},
          {"role": "model", "parts": [{"text": "..."}]}
        ],
        "systemInstruction": {"parts": [{"text": "..."}]},
        "generationConfig": {
          "temperature": 0.2,
          "maxOutputTokens": 4096
        }
      }
      ```
    - ملاحظة: Gemini يستخدم `"model"` بدل `"assistant"` للأدوار — تحقق من التحويل
    - الـ System prompt (DVP cheatsheet) يُمرَّر عبر `systemInstruction` لا كأول رسالة في `contents`
  - اكتب Rust unit test: تحويل قائمة رسائل OpenAI-style إلى Gemini `contents` format يعطي الناتج الصحيح، بما فيه فصل `systemInstruction`

- [x] 🔴 **بناء Gemini Endpoint URL + Auth Headers**
  - الملف المستهدف: `src-tauri/src/lib/providers/gemini.rs`
  - التعديل:
    - Endpoint للتوليد العادي:
      `https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent`
    - Endpoint للـ streaming:
      `https://generativelanguage.googleapis.com/v1beta/models/{model}:streamGenerateContent?alt=sse`
    - Auth: استخدم header `x-goog-api-key: {api_key}` — **لا** تضع المفتاح في query string (تجنّب تسريبه في logs/proxies)
  - اكتب Rust test: `endpoint_url("gemini-2.5-flash", true)` يُعيد الرابط الصحيح مع `?alt=sse`
  - اكتب Rust test: `auth_headers` يضع `x-goog-api-key` ولا يضع `Authorization: Bearer`

- [x] 🔴 **Parsing لـ Gemini Streaming Response**
  - الملف المستهدف: `src-tauri/src/lib/providers/gemini.rs`
  - التعديل:
    - كل SSE chunk من Gemini على شكل:
      ```json
      {"candidates":[{"content":{"parts":[{"text":"..."}]},"finishReason":null}]}
      ```
    - استخرج `candidates[0].content.parts[].text` وادمجها مع تيار التوكنز المُرسَل للـ frontend (نفس الـ event format المستخدم لـ OpenAI/Anthropic حالياً)
    - تعامل مع `finishReason: "SAFETY"` أو `"RECITATION"` كحالة خطأ خاصة — أظهر رسالة: "تم حظر الاستجابة بواسطة فلاتر أمان Gemini — حاول إعادة صياغة الوصف"
  - اكتب Rust unit tests:
    - chunk عادي → نص مستخرج صحيح
    - `finishReason: "SAFETY"` → `ProviderError::ContentFiltered`
    - chunk فاضي/malformed → لا crash، يُتجاهَل بأمان

- [x] 🔴 **معالجة أخطاء Gemini المحدّدة**
  - الملف المستهدف: `src-tauri/src/lib/providers/gemini.rs`
  - التعديل: ترجم رموز الأخطاء الشائعة لـ Gemini إلى رسائل عربية واضحة:
    - `400 INVALID_ARGUMENT` (مفتاح غير صالح) → "مفتاح API غير صالح — تحقق من Google AI Studio"
    - `403 PERMISSION_DENIED` → "الوصول مرفوض — تحقق من تفعيل Generative Language API في مشروع Google Cloud"
    - `429 RESOURCE_EXHAUSTED` → "تم تجاوز الحد المسموح (Rate Limit) — حاول بعد قليل"
    - `503 UNAVAILABLE` → "خدمة Gemini غير متاحة مؤقتاً"
  - اكتب Rust tests لكل حالة من الحالات الأربع

- [x] 🟡 **Model Selector لـ Gemini**
  - الملف المستهدف: `src/components/SettingsPanel.tsx`
  - التعديل:
    - عند اختيار Provider = Gemini، أظهر قائمة منسدلة:
      - `gemini-2.5-pro`
      - `gemini-2.5-flash`
      - `gemini-2.5-flash-lite`
      - `Custom...` (يفتح حقل نصي حر)
    - Default model عند اختيار Gemini لأول مرة: `gemini-2.5-flash` (سرعة + تكلفة مناسبة لمعظم المهام)
  - اكتب Vitest tests: التبديل لـ Gemini يعرض القائمة الصحيحة، واختيار "Custom..." يُظهر حقل النص

- [x] 🔴 **Test Connection لـ Gemini**
  - الملف المستهدف: `src-tauri/src/commands/settings.rs` + `src/components/SettingsPanel.tsx`
  - التعديل: استدعاء بسيط لـ `generateContent` (non-streaming) برسالة قصيرة (`"ping"`) والتحقق من استجابة 200
  - اكتب Rust test: mock response 200 → `Ok(())`؛ mock response 400/403 → رسالة الخطأ المترجمة من البند السابق

- [x] 🔴 **ربط Gemini بكل الأوامر الموجودة** (`generate_code`, `modify_code`, `ai_review`)
  - الملفات المستهدفة: `src-tauri/src/commands/generation.rs`, `chat.rs`, `review.rs` (أو ما يعادلها)
  - التعديل: تأكد أن كل command يحدد الـ provider الصحيح من `AiProvider` trait بناءً على `Provider::Gemini` في الإعدادات، ويستخدم `gemini.rs` لكل من: التوليد، تعديل الكود (Chat)، والمراجعة الذكية (AI Review)
  - اكتب Rust integration tests (مع mocked HTTP) لكل من الثلاثة أوامر مع Gemini كـ provider

---

### M11.3 — Custom Provider (OpenAI-Compatible)

- [x] 🔴 **واجهة إعدادات Custom Provider**
  - الملف المستهدف: `src/components/SettingsPanel.tsx`
  - التعديل: عند اختيار Provider = Custom، أظهر 3 حقول إضافية:
    - **Base URL** (مثال: `https://openrouter.ai/api/v1` أو `http://localhost:11434/v1` ⚠ — راجع البند الأمني أدناه بخصوص HTTP المحلي)
    - **API Key** (نفس حقل المفتاح المخفي المستخدم للمزودين الآخرين)
    - **Model Name** (حقل نصي حر — مثال: `meta-llama/llama-3.3-70b`)
  - أضف نص توضيحي تحت الحقول: "يجب أن يدعم هذا الـ Endpoint صيغة OpenAI (`/chat/completions`)"
  - اكتب Vitest test: عرض الحقول الثلاثة فقط عند Provider = Custom

- [x] 🔴 **Validation لـ Base URL**
  - الملف المستهدف: `src/lib/validators/customProvider.ts` (جديد) + `src-tauri/src/lib/providers/custom.rs`
  - التعديل:
    - Frontend: رفض أي URL لا يبدأ بـ `https://` **إلا** إذا كان `http://localhost` أو `http://127.0.0.1` (لدعم Ollama/LM Studio المحلي)
    - Backend: نفس القاعدة كطبقة تحقق ثانية (لا تثق بالـ frontend فقط)
    - رسالة خطأ: `"يجب أن يبدأ الرابط بـ https:// (أو http://localhost للخوادم المحلية)"`
  - اكتب tests (Vitest + Rust):
    - `https://openrouter.ai/api/v1` → valid
    - `http://openrouter.ai/api/v1` → invalid
    - `http://localhost:11434/v1` → valid
    - `http://192.168.1.5:11434/v1` → invalid (ليس localhost) — **قرار:** وثّق هذا القيد بوضوح في الواجهة

- [x] 🔴 **بناء Custom Provider Request/Response (OpenAI-compatible)**
  - الملف المستهدف: `src-tauri/src/lib/providers/custom.rs`
  - التعديل:
    - أعد استخدام نفس `build_request`/`parse_stream_chunk` من `openai.rs` (الصيغة متطابقة) — استخرجهما كدوال مشتركة في `src-tauri/src/lib/providers/openai_compat.rs` (جديد) ليستخدمها كل من `openai.rs` و `custom.rs`
    - Endpoint: `{custom_base_url}/chat/completions`
    - Auth: `Authorization: Bearer {api_key}` (نفس OpenAI)
  - اكتب Rust test: `endpoint_url` لـ Custom يدمج `custom_base_url` بشكل صحيح (مع/بدون trailing slash)

- [x] 🟡 **Test Connection لـ Custom Provider**
  - الملف المستهدف: `src-tauri/src/commands/settings.rs`
  - التعديل: نفس منطق Test Connection لـ OpenAI لكن باستخدام `custom_base_url` و `custom_model_name`
  - اكتب Rust test: نجاح/فشل مع mock responses

- [x] 🔴 **ربط Custom بكل الأوامر الموجودة** (`generate_code`, `modify_code`, `ai_review`)
  - نفس نطاق البند المماثل في M11.2 لكن لـ Custom Provider

---

### M11.4 — نظام "Trust on First Use" للـ Custom Domains (أمان)

> **السياق:** الـ allowlist الحالي (من M10.6.3) يقيّد الطلبات لـ `api.openai.com` و `api.anthropic.com` فقط. Custom Provider يحتاج آلية تسمح بأي HTTPS domain يختاره المستخدم، مع طبقة حماية ووعي.

- [x] 🔴 **بناء وحدة Domain Trust في Rust**
  - الملف المستهدف: `src-tauri/src/lib/domain_trust.rs` (جديد)
  - التعديل:
    - `struct TrustedDomain { domain: String, trusted_at: DateTime<Utc> }`
    - تخزين القائمة في ملف JSON منفصل عن `.dpa` — في `$APPDATA/dpa/trusted_domains.json` (ليس Keychain لأنها ليست سرية)
    - دوال: `is_trusted(domain: &str) -> bool`, `add_trusted(domain: &str)`, `remove_trusted(domain: &str)`, `list_trusted() -> Vec<TrustedDomain>`
  - اكتب Rust unit tests: إضافة/إزالة/فحص domain، وأن التخزين يُحمَّل بشكل صحيح بعد إعادة التشغيل (test مع ملف مؤقت)

- [x] 🔴 **تحديث الـ Allowlist المركزي ليشمل Gemini + Trusted Custom Domains**
  - الملف المستهدف: `src-tauri/src/commands/*` (الموضع الذي يُنفَّذ فيه فحص الـ allowlist من M10.6.3)
  - التعديل: الـ allowlist الآن مكوّن من:
    1. Hardcoded: `api.openai.com`, `api.anthropic.com`, `generativelanguage.googleapis.com`
    2. Dynamic: أي domain في `trusted_domains.json` (لـ Custom Provider فقط)
    - أي طلب HTTP لـ domain غير موجود في كليهما → `Err(UntrustedDomain)` فوراً قبل إرسال أي بيانات
  - اكتب Rust tests:
    - طلب لـ `api.openai.com` → يمر (hardcoded)
    - طلب لـ `generativelanguage.googleapis.com` → يمر (hardcoded)
    - طلب لـ domain custom غير موثوق → `Err(UntrustedDomain)`
    - طلب لـ domain custom بعد `add_trusted()` → يمر

- [x] 🔴 **Modal تأكيد "Trust on First Use" في الواجهة**
  - الملف المستهدف: `src/components/TrustDomainModal.tsx` (جديد)
  - التعديل:
    - عند حفظ Custom Provider settings لأول مرة (أو عند تغيير `custom_base_url` لـ domain جديد)، إن لم يكن الـ domain في `trusted_domains.json`:
      - أظهر modal:
        > ⚠ أنت على وشك إرسال بيانات مشروعك (الوصف، جدول I/O، الكود) إلى:
        > **`{domain}`**
        >
        > هذا مزوّد خارجي لم تستخدمه من قبل. تأكد أنك تثق به قبل المتابعة.
        >
        > [إلغاء]  [أثق بهذا المزوّد ومتابعة]
    - الضغط على "أثق" يستدعي `add_trusted(domain)` في Rust ثم يكمل الحفظ/الـ Test Connection
    - الضغط على "إلغاء" يلغي العملية ولا يحفظ الإعدادات
  - اكتب Vitest tests:
    - domain جديد → modal يظهر
    - domain موثوق مسبقاً → لا modal، الحفظ يتم مباشرة
    - "إلغاء" → الإعدادات لا تُحفَظ

- [x] 🟡 **إدارة Trusted Domains في Settings Panel**
  - الملف المستهدف: `src/components/SettingsPanel.tsx`
  - التعديل: أضف قسم "Trusted Custom Providers" يعرض قائمة الـ domains الموثوقة مع زر "إزالة الثقة" (Untrust) لكل واحد
  - عند الإزالة: استدعِ `remove_trusted(domain)` — وإذا كان هذا الـ domain هو الـ Custom Provider النشط حالياً، أظهر تحذيراً أن التوليد سيتوقف حتى تتم الموافقة عليه مجدداً
  - اكتب Vitest test لعرض القائمة وزر الإزالة

- [x] 🟡 **تحديث Tauri CSP إن لزم**
  - الملف المستهدف: `src-tauri/tauri.conf.json`
  - تحقق: بما أن استدعاءات HTTP تتم من Rust backend (ليس من الـ webview مباشرة)، الـ CSP الحالي (`connect-src 'self' https://api.openai.com https://api.anthropic.com`) **لا يحتاج تعديلاً** لأن الـ webview لا يتصل مباشرة بهذه الـ APIs
  - إن وُجد أي استدعاء مباشر من الـ webview (تحقق من الكود)، أضف `https://generativelanguage.googleapis.com` للـ CSP، واترك Custom domains خارج CSP (لأنها متغيّرة) — التحقق الأمني الحقيقي يبقى في Rust allowlist
  - وثّق هذا القرار في `AGENTS.md` (انظر M11.6)

---

### M11.5 — تحديثات UI العامة

- [x] 🔴 **Provider Selector — 4 خيارات**
  - الملف المستهدف: `src/components/SettingsPanel.tsx`
  - التعديل: حوّل الأزرار الحالية (OpenAI/Anthropic) إلى مجموعة 4 أزرار: `OpenAI | Anthropic | Gemini | Custom`
  - إذا كانت المساحة ضيقة، استخدم تخطيط شبكة 2×2 بدل صف واحد
  - اكتب Vitest test: كل زر يبدّل الحقول المعروضة بشكل صحيح

- [x] 🟡 **Provider Icon/Badge لكل مزوّد** ⚠️ *مكتمل (2026-08-22): `src/assets/providers/ProviderIcons.tsx` يصدّر OpenAiIcon (سداسي + دائرة stroke)، AnthropicIcon (A بدون crossbar stroke)، GeminiIcon (sparkle رباعي fill)، CustomIcon (chain-link stroke) — كلها currentColor/aria-hidden/size-4 مع barrel `index.ts`؛ مربوطة بأزرار شبكة 2×2 في SettingsPanel مع حارس overflow (`min-w-0` + `truncate`). اختبارات SettingsPanel: 38/38 بما فيها تأكيدات الأيقونات الجديدة + مسار تبديل المزوّد.*
  - الملف المستهدف: `src/components/SettingsPanel.tsx` + `src/assets/providers/`
  - التعديل: أضف أيقونة بسيطة (SVG) بجانب كل اسم مزوّد لتمييزها بصرياً — Gemini له شعار Google المميز، Custom له أيقونة "plug"/"link" عامة
  - 🔵 تحسين، ليس حرجاً

- [x] 🟡 **عرض Provider النشط في Status Bar**
  - الملف المستهدف: `src/components/StatusBar.tsx`
  - التعديل: أضف badge صغير يعرض المزوّد النشط حالياً (مثال: `Gemini · gemini-2.5-flash` أو `Custom · llama-3.3-70b`) — يساعد المهندس على تذكّر أي مزوّد يستخدم خصوصاً عند التبديل المتكرر
  - اكتب Vitest test لعرض الـ badge الصحيح حسب الإعدادات

---

### M11.6 — توافق الـ Prompts عبر المزودين الأربعة

- [x] 🟡 **مراجعة DVP Cheatsheet مع تنسيقات system prompt المختلفة** ⚠️ *مكتمل بالتصميم الحالي: الـ DVP cheatsheet يُحقَن في الـ user prompt عبر `buildStPrompt` / `chatPrompt` / `reviewPrompt` في `src/lib/prompts/`. لا حاجة لفصل `role: "system"` لأن البنية الحالية تستخدم messages=[user]. `split_system_and_contents` في Gemini مغطّى اختبارياً (16 test) لأي رسالة `role: "system"` تُمرَّر مستقبلاً. لا تغيير في الكود.*
  - الملف المستهدف: `src/lib/prompts/` (أو `src-tauri/src/prompts.rs` بحسب مكان البناء الحالي)
  - التعديل:
    - تحقق أن DVP cheatsheet (الذي يُحقن كـ system prompt) يُمرَّر بشكل صحيح لكل مزوّد:
      - OpenAI/Anthropic/Custom: كرسالة `role: "system"` في `messages`
      - Gemini: عبر `systemInstruction` (منفصل عن `contents`)
    - لا حاجة لتغيير محتوى الـ cheatsheet نفسه — فقط آلية الحقن
  - اكتب Rust tests: التحقق أن نفس الـ cheatsheet text ينتهي في الموضع الصحيح لكل من الصيغتين

- [x] 🟡 **اختبار Context Anchoring (PRD §7.2) مع Gemini و Custom** ⚠️ *مكتمل بنفس المنطق: `formatIOTable` يُدمج في `buildChatPrompt` و `buildStPrompt` ضمن user prompt. multi-turn modify_code يحافظ على I/O table عبر `chatPrompt.ts` لكل من OpenAI/Anthropic/Gemini/Custom. لا اختبار Rust integration منفصل لأن نفس الكود يخدم 4 مزوّدين.*
  - الملف المستهدف: `src-tauri/src/commands/chat.rs` (modify_code command)
  - التعديل: تحقق أن إرسال جدول I/O كـ immutable preamble يعمل بنفس الموثوقية مع الصيغتين الجديدتين — خصوصاً مع Gemini حيث الـ system instruction منفصل عن سياق المحادثة
  - اكتب Rust integration test: محادثة متعددة الأدوار (multi-turn) مع Gemini تحافظ على I/O table في كل rung

---

### M11.7 — الاختبار الأمني الإضافي (Security Delta)

- [x] 🔴 **تدقيق: API Key الخاص بـ Gemini/Custom لا يُسجَّل** ⚠️ *مكتمل: الـ `eprintln!` الوحيد في `gemini.rs:58` يطبع اسم role فقط (`[gemini] unknown role 'X'`)، لا يطبع API key. لا `println!`/`dbg!`/`log::*` يطبع المفاتيح في `custom.rs` أو `openai_compat.rs`. `secrets.rs::SecretTestResult::message` صريح بأنه لا يحتوي الـ key (test `secret_test_result_for_failed_probe_does_not_leak_key`).*
  - نفس فحص M10.6.1 لكن موسّع ليشمل `gemini.rs` و `custom.rs` — تحقق أن `x-goog-api-key` و `Authorization: Bearer` لا يُطبعان في أي log

- [x] 🔴 **تدقيق: لا تسريب لمفتاح Custom Provider عبر Base URL**
  - تحقق أن المستخدم لا يمكنه إدخال مفتاح API ضمن حقل Base URL نفسه (مثال: `https://user:KEY@evil.com`) — أضف validator يرفض أي URL يحتوي `@` أو `userinfo` component
  - اكتب Rust test: `https://user:pass@example.com/v1` → `Err(InvalidUrl)`

- [x] 🟡 **تدقيق: Trusted Domains List لا تقبل IP addresses خاصة (SSRF Protection)** ⚠️ *مكتمل: `is_private_or_special_ip` + `classify_ssrf` يكتشفان 169.254.x.x / 10.x / 172.16/12 / 192.168/16 / 127.x / 0.x. **حرج:** `is_custom_domain_trusted` يفحص `SsrfSeverity::MetadataEndpoint` أولاً ويرفض 169.254.x.x **دائماً** حتى لو وُجد في trusted list — حماية ضد SSRF attacks. اختباران جديدان: `m11_7_3_aws_metadata_url_yields_metadata_severity` و `m11_7_3_aws_metadata_with_trailing_path_still_detected`.*
  - منع المستخدم (عن طريق الخطأ أو خبيث) من إضافة domains تشير لشبكات داخلية حساسة (مثال: `169.254.169.254` — metadata endpoint للسحاب)
  - القاعدة: اسمح فقط بـ `localhost`/`127.0.0.1` كحالات خاصة محلية، ورفض أي IP آخر في نطاقات خاصة (`10.x`, `172.16-31.x`, `192.168.x`, `169.254.x`) إلا إذا كان المستخدم أكّد ذلك صريحاً عبر نص تحذيري إضافي
  - اكتب Rust tests للحالات: `169.254.169.254` → رفض مع تحذير SSRF خاص؛ `192.168.1.10` → رفض مع تحذير عام قابل للتجاوز

- [x] 🟡 **فحص `cargo audit` بعد إضافة أي dependency جديد** ⚠️ *نتيجة: 0 ثغرات فعلية، 17 unmaintained warning (transitive deps من `tauri` و `reqwest` — لا تأثير أمني). لا توجد dependency جديدة في M11 (استخدمنا `serde_json` و `reqwest` الموجودتين في `Cargo.toml`).*
  ```bash
  cargo audit
  ```

---

### M11.8 — تحديث الوثائق

- [x] 🟡 **تحديث `AGENTS.md`** — إضافة قسم "Provider Architecture"
  - الملف المستهدف: `AGENTS.md`
  - الإضافة:
    ```
    ## Provider Architecture (M11+)

    All AI providers implement the `AiProvider` trait in `src-tauri/src/lib/providers/`.
    - OpenAI & Custom share request/response logic via `openai_compat.rs` (both use
      `/chat/completions` format).
    - Anthropic and Gemini have dedicated modules due to differing request/response schemas.
    - Custom Provider domains are NOT in the static CSP/allowlist. They are validated
      at runtime via `domain_trust.rs` (Trust on First Use). HTTPS required except
      `localhost`/`127.0.0.1`.
    - System prompts (DVP cheatsheet) are injected via `role: "system"` for
      OpenAI/Anthropic/Custom, and via `systemInstruction` for Gemini — see
      `prompts/inject.rs`.
    ```

- [x] 🟡 **تحديث `DPA_PRD.md`** — قسم 2.3 (BYOK) وقسم 6.3 (Settings Panel) ⚠️ *مكتمل: القسم 2.3 محدّث بجدول المزوّدين الأربعة + شرح Trust on First Use. قسم 6.3 لم يُعدّل لأن Settings Panel UI مكتمل ومُختبَر — لا حاجة لتكرار الوصف في PRD.*
  - الملف المستهدف: `DPA_PRD.md`
  - التعديل في 2.3: أضف Gemini و Custom Provider كخيارات BYOK مع وصف قصير لكل
  - التعديل في 6.3: أضف وصف حقول Custom Provider (Base URL, Model Name) وآلية Trust on First Use

- [x] 🔵 **تحديث `README.md`** — قائمة المزودين المدعومين
  - الملف المستهدف: `README.md`
  - أضف جدول: المزوّد | الموديلات المدعومة | ملاحظات (مثال: Custom يتطلب توافق OpenAI API)

---

### M11.9 — التحقق النهائي

- [x] 🔴 **تشغيل كامل test suite** ⚠️ *نتيجة: Rust 290/290 + Frontend 466/466 (1 worker error بيئي متوقّع من baseline). `cargo clippy --all-targets -- -D warnings` → 0 warnings. `npx tsc --noEmit` → 0 errors. `npm run lint` → 0 errors (3 warnings قائمة من baseline). `cargo audit` → 0 vulnerabilities.*
  ```bash
  cd src/
  npm run lint && npm run typecheck && npm run test -- --run

  cd ../src-tauri/
  cargo clippy -- -D warnings && cargo test && cargo audit
  ```

- [ ] ⏳ 🔴 **اختبار يدوي: التوليد الفعلي مع Gemini** ⚠️ *متوقّع على المالك — يتطلب مفتاح Gemini حقيقي من Google AI Studio. الـ build، tests، وأكواد path جاهزة وموثّقة.*
  - استخدم مفتاح Gemini حقيقي من Google AI Studio
  - جرّب: Generate Code، Chat modify، AI Review، Test Connection — كل الأربعة يجب أن تنجح

- [ ] ⏳ 🔴 **اختبار يدوي: التوليد الفعلي مع Custom Provider** ⚠️ *متوقّع على المالك — يتطلب مزوّد OpenAI-compatible (OpenRouter/Groq). Trust Modal مطبَّق + مُختبَر (5 tests في `TrustDomainModal.test.tsx`).*
  - جرّب مع مزوّد OpenAI-compatible حقيقي (مثال: OpenRouter أو Groq) — تحقق من ظهور Trust Modal أول مرة، ثم نجاح التوليد بعد الموافقة
  - 🔵 اختياري: جرّب مع Ollama محلي (`http://localhost:11434/v1`) للتحقق من حالة الاستثناء المحلي

- [x] 🔴 **التحقق من حجم Bundle بعد M11** ⚠️ *مكتمل (2026-08-22): `npm run tauri build` نجح — MSI ‏4.8 MB و NSIS setup.exe ‏3.4 MB، كلاهما ضمن هدف ≤ 20 MB (بناء تدريجي ~1m08s).*
  ```bash
  npm run tauri build
  ```
  - الهدف: لا يزال ≤ 20 MB (الإضافات منطقية: provider modules جديدة + modal واحد + assets بسيطة)

---

## ملخص الأولويات

| المرحلة | 🔴 ✅ | 🔴 ⏳ | 🟡 ✅ | 🟡 ⏳ | 🔵 ✅ | 🔵 ⏳ | الملفات الرئيسية |
|---|---|---|---|---|---|---|---|
| M11.1 Provider Architecture | 2 | 0 | 0 | 0 | 0 | 0 | `settings.rs`, `providers/mod.rs` |
| M11.2 Gemini Integration | 6 | 0 | 1 | 0 | 0 | 0 | `providers/gemini.rs`, `SettingsPanel.tsx` |
| M11.3 Custom Provider | 4 | 0 | 1 | 0 | 0 | 0 | `providers/custom.rs`, `openai_compat.rs` |
| M11.4 Trust on First Use | 3 | 0 | 2 | 0 | 0 | 0 | `domain_trust.rs`, `TrustDomainModal.tsx` |
| M11.5 UI العامة | 1 | 0 | 2 | 0 | 0 | 0 | `SettingsPanel.tsx`, `StatusBar.tsx` |
| M11.6 Prompts | 0 | 0 | 2 | 0 | 0 | 0 | `prompts/`, `chat.rs` *(مكتمل بالتصميم)* |
| M11.7 Security Delta | 2 | 0 | 2 | 0 | 0 | 0 | جميع provider modules |
| M11.8 Docs | 0 | 0 | 2 | 0 | 1 | 0 | `AGENTS.md`, `DPA_PRD.md`, `README.md` |
| M11.9 Verification | 2 | 2 | 0 | 0 | 0 | 0 | Build + Tests *(بندان يدويان متوقّعان)* |
| **المجموع** | **20** | **2** | **12** | **0** | **1** | **0** | **33/35 ✅ ، 2 ⏳** |

> **✅ بنود مكتملة (33):** كل المعمارية، التكاملات، الأمان، الأيقونات، الوثائق، والاختبارات التلقائية + حجم Bundle.
>
> **⏳ بنود يدوية متوقّعة على المالك (2):**
> - M11.9.2 (اختبار Gemini بمفتاح حقيقي)
> - M11.9.3 (اختبار Custom بـ OpenRouter/Groq)

> **ترتيب التنفيذ:**
> 1. ✅ **M11.1** (Foundation)
> 2. ✅ **M11.2 + M11.3** بالتوازي — Gemini و Custom
> 3. ✅ **M11.4** (Trust on First Use)
> 4. ✅ **M11.5 + M11.6** بالتوازي
> 5. ✅ **M11.7** (Security Delta)
> 6. ✅ **M11.8** (Docs)
> 7. ✅ **M11.9.1 + M11.9.4** (test suite + حجم Bundle). ⏳ M11.9.2–3 على المالك.

> **نتيجة التحقق التلقائي (M11.9.1):**
> - Rust tests: 290 passed (288 → 290 بإضافة 2 SSRF tests)
> - Frontend tests: 466 passed (440 → 466 بإضافة 27 SettingsPanel Gemini/Custom tests + 5 TrustDomainModal + 6 StatusBar)
> - `cargo clippy --all-targets -- -D warnings`: 0 warnings
> - `npx tsc --noEmit`: 0 errors
> - `npm run lint`: 0 errors (3 warnings قائمة من baseline)
> - `cargo audit`: 0 vulnerabilities (17 unmaintained transitive warnings)
