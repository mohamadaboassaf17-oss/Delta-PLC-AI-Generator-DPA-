import type { SVGProps } from 'react'

/**
 * Step 3 — Enter API key placeholder illustration.
 *
 * Key-shaped input field with a Show/Hide toggle, suggesting the
 * paste-and-validate moment of the wizard.
 */
export function Step3EnterKeyIllustration(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 200 120"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Step 3: Enter API key illustration"
      data-testid="wizard-illustration-step-3"
      {...props}
    >
      <rect width="200" height="120" fill="#f1f5f9" rx="8" />
      <circle cx="56" cy="60" r="18" fill="#ffffff" stroke="#cbd5e1" strokeWidth="1" />
      <circle cx="56" cy="60" r="6" fill="#cbd5e1" />
      <rect x="50" y="60" width="12" height="8" fill="#cbd5e1" rx="1" />
      <rect x="80" y="44" width="92" height="16" fill="#ffffff" stroke="#cbd5e1" strokeWidth="1" rx="3" />
      <rect x="86" y="50" width="48" height="4" fill="#475569" rx="2" />
      <rect x="86" y="56" width="32" height="3" fill="#94a3b8" rx="1" />
      <rect x="146" y="50" width="20" height="4" fill="#94a3b8" rx="2" />
      <rect x="80" y="66" width="48" height="6" fill="#475569" rx="2" />
      <rect x="80" y="76" width="92" height="4" fill="#cbd5e1" rx="2" />
      <text x="100" y="112" textAnchor="middle" fontSize="9" fill="#64748b">
        Step 3 — Paste &amp; Validate
      </text>
    </svg>
  )
}
