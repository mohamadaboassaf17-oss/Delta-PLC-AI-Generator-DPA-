import type { SVGProps } from 'react'

/**
 * Step 1 — Choose Provider placeholder illustration.
 *
 * Slate flat-color panel with two provider chips. Replace with a real
 * screenshot of the step once the UI stabilizes.
 */
export function Step1ProviderIllustration(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 200 120"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Step 1: Choose provider illustration"
      data-testid="wizard-illustration-step-1"
      {...props}
    >
      <rect width="200" height="120" fill="#f1f5f9" rx="8" />
      <rect x="16" y="22" width="78" height="76" fill="#ffffff" stroke="#cbd5e1" strokeWidth="1" rx="6" />
      <rect x="106" y="22" width="78" height="76" fill="#ffffff" stroke="#cbd5e1" strokeWidth="1" rx="6" />
      <circle cx="36" cy="46" r="10" fill="#e2e8f0" />
      <rect x="50" y="40" width="36" height="6" fill="#475569" rx="2" />
      <rect x="50" y="50" width="24" height="4" fill="#94a3b8" rx="2" />
      <circle cx="126" cy="46" r="10" fill="#e2e8f0" />
      <rect x="140" y="40" width="36" height="6" fill="#475569" rx="2" />
      <rect x="140" y="50" width="24" height="4" fill="#94a3b8" rx="2" />
      <rect x="36" y="78" width="58" height="4" fill="#cbd5e1" rx="2" />
      <rect x="36" y="86" width="40" height="4" fill="#cbd5e1" rx="2" />
      <rect x="126" y="78" width="58" height="4" fill="#cbd5e1" rx="2" />
      <rect x="126" y="86" width="40" height="4" fill="#cbd5e1" rx="2" />
      <text x="100" y="112" textAnchor="middle" fontSize="9" fill="#64748b">
        Step 1 — Choose Provider
      </text>
    </svg>
  )
}
