import type { SVGProps } from 'react'

/**
 * Step 2 — Get API key placeholder illustration.
 *
 * Stylized browser-window frame with a "Create key" button row.
 * Replace with a real screenshot of the provider's key page.
 */
export function Step2GetKeyIllustration(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 200 120"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Step 2: Get API key illustration"
      data-testid="wizard-illustration-step-2"
      {...props}
    >
      <rect width="200" height="120" fill="#f1f5f9" rx="8" />
      <rect x="22" y="18" width="156" height="84" fill="#ffffff" stroke="#cbd5e1" strokeWidth="1" rx="6" />
      <rect x="22" y="18" width="156" height="14" fill="#e2e8f0" rx="6" />
      <rect x="22" y="26" width="156" height="6" fill="#e2e8f0" />
      <circle cx="30" cy="25" r="2" fill="#cbd5e1" />
      <circle cx="38" cy="25" r="2" fill="#cbd5e1" />
      <circle cx="46" cy="25" r="2" fill="#cbd5e1" />
      <rect x="32" y="42" width="80" height="6" fill="#475569" rx="2" />
      <rect x="32" y="54" width="136" height="4" fill="#cbd5e1" rx="2" />
      <rect x="32" y="64" width="100" height="4" fill="#cbd5e1" rx="2" />
      <rect x="118" y="76" width="52" height="16" fill="#2563eb" rx="4" />
      <text x="144" y="87" textAnchor="middle" fontSize="7" fill="#ffffff">
        Create key
      </text>
      <text x="100" y="112" textAnchor="middle" fontSize="9" fill="#64748b">
        Step 2 — Get API Key
      </text>
    </svg>
  )
}
