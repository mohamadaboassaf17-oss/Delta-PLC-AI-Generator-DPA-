import type { SVGProps } from 'react'

/**
 * Step 4 — Test result placeholder illustration.
 *
 * Success checkmark inside a green ring with a small latency tag,
 * mirroring the "✓ Connected" state of the real wizard step.
 */
export function Step4TestIllustration(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 200 120"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Step 4: Test result illustration"
      data-testid="wizard-illustration-step-4"
      {...props}
    >
      <rect width="200" height="120" fill="#f1f5f9" rx="8" />
      <circle cx="100" cy="56" r="26" fill="#16a34a" />
      <path
        d="M86 56 L96 66 L114 46"
        stroke="#ffffff"
        strokeWidth="4"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <rect x="64" y="92" width="72" height="6" fill="#cbd5e1" rx="2" />
      <text x="100" y="112" textAnchor="middle" fontSize="9" fill="#64748b">
        Step 4 — Verified &amp; Ready
      </text>
    </svg>
  )
}
