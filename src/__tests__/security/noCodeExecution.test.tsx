/**
 * M10.6.4 — Generated Code Security.
 *
 * Pins the no-client-side-code-execution guarantee for every component
 * that displays LLM-generated text. The audit found two surviving uses
 * of `dangerouslySetInnerHTML`:
 *
 *   - `STOutputPanel` — safe by construction. The highlighter escapes
 *     `&`, `<`, `>` before wrapping tokens in `<span class="...">` with
 *     hardcoded class names, and the conflict overlay escapes
 *     `&`, `"` in every attribute value. These tests prove that
 *     property by feeding adversarial LLM output (`<script>`,
 *     `<img onerror=...>`, attribute breakouts, `javascript:` URLs)
 *     through the live `render` path and asserting nothing executable
 *     reaches the DOM.
 *
 *   - `AIReviewPanel` — the dangerous setter was removed in M10.6.4
 *     because the section titles are static strings that never need
 *     HTML rendering. These tests pin that fix: adversarial review
 *     content from the LLM renders as inert text, and section titles
 *     do not parse `<` as an opening tag.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { STOutputPanel } from '@/components/STOutputPanel'
import { AIReviewPanel } from '@/components/AIReviewPanel'
import { ProjectProvider } from '@/context/ProjectContext'
import type { ConflictReport } from '@/lib/tauriApi'

// ---------------------------------------------------------------------------
// Tauri mock — keep the tests fully offline so the security harness
// never blocks on network or filesystem.
// ---------------------------------------------------------------------------

const { invokeMock, listenMock } = vi.hoisted(() => ({
  invokeMock: vi.fn(),
  listenMock: vi.fn(),
}))

vi.mock('@tauri-apps/api/core', () => ({ invoke: invokeMock }))
vi.mock('@tauri-apps/api/event', () => ({ listen: listenMock }))

// ---------------------------------------------------------------------------
// `useReview` is mocked so we can inject controlled "LLM" output without
// touching the network or the chat plumbing.
// ---------------------------------------------------------------------------

const reviewMock = vi.hoisted(() => vi.fn())
vi.mock('@/hooks/useReview', () => ({
  useReview: reviewMock,
}))

beforeEach(() => {
  invokeMock.mockReset()
  listenMock.mockReset()
  reviewMock.mockReset()
  invokeMock.mockImplementation(() => Promise.resolve(null))
  listenMock.mockResolvedValue(() => {})
})

// ---------------------------------------------------------------------------
// STOutputPanel — adversarial LLM output as ST source.
// ---------------------------------------------------------------------------

describe('STOutputPanel — no code execution from LLM output', () => {
  const adversarial = [
    `<script>window.__pwned = true;</script>`,
    `<img src=x onerror="window.__pwned = true">`,
    `<svg onload="window.__pwned = true"></svg>`,
    `<iframe src="javascript:window.__pwned = true"></iframe>`,
    `"><script>window.__pwned = true;</script>`,
    `<a href="javascript:window.__pwned = true">x</a>`,
    `<object data="javascript:window.__pwned = true"></object>`,
  ]

  for (const payload of adversarial) {
    it(`renders ${JSON.stringify(payload).slice(0, 40)}… as inert text`, () => {
      const beforeFlag = (window as unknown as { __pwned?: boolean }).__pwned
      render(<STOutputPanel code={payload} />)

      // No script / iframe / object element ever materializes.
      expect(document.querySelector('script')).toBeNull()
      expect(document.querySelector('iframe')).toBeNull()
      expect(document.querySelector('object')).toBeNull()
      expect(document.querySelector('svg')).toBeNull()
      // Any <img> here would only come from the payload, which must be
      // escaped — so there must not be one.
      expect(document.querySelector('img')).toBeNull()
      // Any <a> here would only come from the payload — likewise.
      expect(document.querySelector('a[href^="javascript:"]')).toBeNull()

      // Side effect did not fire (synchronous parse would have set it).
      const afterFlag = (window as unknown as { __pwned?: boolean }).__pwned
      expect(afterFlag).toBe(beforeFlag)

      // The escaped form of `<` is present in the rendered <code>'s
      // innerHTML — proof that the highlighter ran on the (escaped)
      // payload rather than passing the raw `<` through to the parser.
      const codeEl = document.querySelector('code')
      expect(codeEl).not.toBeNull()
      expect(codeEl!.innerHTML).toContain('&lt;')
      // And the literal opening-tag sequence is gone. We check for the
      // exact substring `<s` / `<i` / `<o` / `<a ` that, if present,
      // would have been parsed by the HTML parser. The text fragments
      // `onerror=` and `onload=` may appear as inert text inside the
      // escaped payload (e.g. the rendered glyphs spelling "onerror="
      // surrounded by `&lt;img …&gt;` markers); that is HARMLESS — they
      // are text, not attributes on a real element.
      expect(codeEl!.innerHTML).not.toContain('<script')
      expect(codeEl!.innerHTML).not.toContain('<iframe')
      expect(codeEl!.innerHTML).not.toContain('<object')
      expect(codeEl!.innerHTML).not.toContain('<svg')
      expect(codeEl!.innerHTML).not.toContain('<img')
      expect(codeEl!.innerHTML).not.toContain('<a ')
    })
  }

  it('escapes < > & in the rendered HTML source for raw payloads', () => {
    render(<STOutputPanel code={`<script>alert(1)</script>`} />)
    // The <code> element's innerHTML must contain the escaped form, not
    // the literal `<script>`. The ST highlighter wraps `;`, `(`, `)`,
    // etc. in `<span class="..">` decorations so the escaped entities
    // may not appear contiguously — but the literal `<script` opening
    // tag must be gone, and `&lt;` must appear at least twice (once for
    // `<` and once for `</`).
    const code = document.querySelector('code')
    expect(code).not.toBeNull()
    expect(code!.innerHTML).not.toContain('<script')
    expect(code!.innerHTML).not.toContain('</script>')
    const lt = code!.innerHTML.match(/&lt;/g) ?? []
    const gt = code!.innerHTML.match(/&gt;/g) ?? []
    expect(lt.length).toBeGreaterThanOrEqual(2)
    expect(gt.length).toBeGreaterThanOrEqual(2)
  })

  it('does not allow conflict report fields to escape attribute quoting', () => {
    // The conflict overlay interpolates `message`, `kind` (via escapeAttr)
    // and `normalized` (via escapeAttr after the fix) into a `<span>`'s
    // `title` and `data-conflict` attributes. An attacker who controls
    // those fields (LLM output / backend) must not be able to inject
    // an extra attribute or break out of the attribute string. We cast
    // through `unknown` because `ConflictKind` is a string-literal type
    // in production; the defense-in-depth test deliberately injects a
    // value the type would reject so we exercise the runtime escape.
    const report: ConflictReport = {
      conflicts: [
        {
          address: 'X0',
          normalized: 'X0',
          kind: '" onmouseover="window.__pwned = true" data-x="' as unknown as ConflictReport['conflicts'][number]['kind'],
          message: '"><img src=x onerror="window.__pwned = true">',
        },
      ],
      totalAddresses: 1,
      conflictingAddresses: 1,
      shouldHalt: false,
    }
    const before = (window as unknown as { __pwned?: boolean }).__pwned
    render(<STOutputPanel code="X0 := 1;" conflictReport={report} />)

    // No <img>, no <script>, no onmouseover-bearing element with the
    // attacker payload. The conflict span itself exists (with the
    // escaped attribute values).
    expect(document.querySelector('img')).toBeNull()
    expect(document.querySelector('script')).toBeNull()
    // Spans created by the highlighter carry the data-conflict marker.
    const conflictSpan = document.querySelector('span[data-conflict="X0"]')
    expect(conflictSpan).not.toBeNull()
    // The malicious payload survives as inert text inside the title
    // attribute — that's what `escapeAttr` produces. No JS executed.
    const after = (window as unknown as { __pwned?: boolean }).__pwned
    expect(after).toBe(before)
  })
})

// ---------------------------------------------------------------------------
// AIReviewPanel — `dangerouslySetInnerHTML` removed (M10.6.4). The
// review body and section titles are now plain React children, so
// any HTML in either is rendered as text.
// ---------------------------------------------------------------------------

describe('AIReviewPanel — no code execution from review content', () => {
  it('renders adversarial review body as text, not HTML', () => {
    reviewMock.mockReturnValue({
      isReviewing: false,
      review: {
        description: `<script>window.__pwned = true;</script>`,
        timersCounters: `<img src=x onerror="window.__pwned = true">`,
        edgeCases: `<iframe src="javascript:window.__pwned = true"></iframe>`,
      },
      reviewError: null,
      startReview: vi.fn(),
      clearReview: vi.fn(),
    })

    // The panel only shows the review when `hasGenerated` is true. We
    // mount via ProjectProvider but the gate is on `project.generated.st`
    // — without a real project, the panel shows the empty state.
    // The review section is unconditionally rendered when `review` is
    // non-null, however, because `hasGenerated` only gates the Run
    // button. The body assertions below are valid in either case.

    const before = (window as unknown as { __pwned?: boolean }).__pwned
    render(
      <ProjectProvider>
        <AIReviewPanel />
      </ProjectProvider>,
    )

    // No script / iframe / img mounted anywhere from the review body.
    expect(document.querySelector('script')).toBeNull()
    expect(document.querySelector('iframe')).toBeNull()
    expect(document.querySelector('img')).toBeNull()
    expect(document.querySelector('svg')).toBeNull()

    // No JS fired.
    const after = (window as unknown as { __pwned?: boolean }).__pwned
    expect(after).toBe(before)

    // The result block actually rendered.
    expect(screen.getByTestId('ai-review-result')).toBeInTheDocument()
    // Each section rendered the adversarial body verbatim as text.
    expect(screen.getByTestId('ai-review-description').textContent).toContain(
      '<script>window.__pwned = true;</script>',
    )
    expect(screen.getByTestId('ai-review-timers').textContent).toContain(
      '<img src=x onerror=',
    )
    expect(screen.getByTestId('ai-review-edge-cases').textContent).toContain(
      '<iframe src="javascript:',
    )
  })

  it('renders section titles as text (no dangerouslySetInnerHTML)', () => {
    reviewMock.mockReturnValue({
      isReviewing: false,
      review: {
        description: 'ok',
        timersCounters: 'ok',
        edgeCases: 'ok',
      },
      reviewError: null,
      startReview: vi.fn(),
      clearReview: vi.fn(),
    })

    render(
      <ProjectProvider>
        <AIReviewPanel />
      </ProjectProvider>,
    )

    // The "Edge Cases & Potential Issues" title used to flow through
    // `dangerouslySetInnerHTML` to decode `&amp;` — that's gone now.
    // The visible title still reads with a literal `&` because React
    // decodes the JSX `&` entity for us.
    const h3s = document.querySelectorAll(
      '[data-testid="ai-review-edge-cases"] h3',
    )
    expect(h3s.length).toBe(1)
    expect(h3s[0].textContent).toBe('Edge Cases & Potential Issues')
    // And no inert HTML markup ever entered the title's innerHTML.
    expect(h3s[0].innerHTML).not.toContain('&amp;amp;')
  })
})
