import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ModelLimitsBanner } from '@/components/ModelLimitsBanner'
import type { ModelLimitResult } from '@/lib/tauriApi'

describe('ModelLimitsBanner', () => {
  it('renders nothing when limits is null', () => {
    const { container } = render(<ModelLimitsBanner limits={null} isLoading={false} error={null} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders nothing when there is no excess', () => {
    const limits: ModelLimitResult = {
      model: 'DVP-SS2',
      xCount: 2,
      yCount: 0,
      mCount: 0,
      tCount: 0,
      cCount: 0,
      xExcess: 0,
      yExcess: 0,
      mExcess: 0,
      tExcess: 0,
      cExcess: 0,
      anyExcess: false,
    }
    const { container } = render(
      <ModelLimitsBanner limits={limits} isLoading={false} error={null} />,
    )
    expect(container.firstChild).toBeNull()
  })

  it('renders yellow banner with category excesses when any category overflows', () => {
    const limits: ModelLimitResult = {
      model: 'DVP-SS2',
      xCount: 10,
      yCount: 0,
      mCount: 0,
      tCount: 0,
      cCount: 0,
      xExcess: 2,
      yExcess: 0,
      mExcess: 0,
      tExcess: 0,
      cExcess: 0,
      anyExcess: true,
    }
    render(<ModelLimitsBanner limits={limits} isLoading={false} error={null} />)
    const banner = screen.getByTestId('model-limits-banner')
    expect(banner).toBeInTheDocument()
    expect(banner.textContent).toContain('DVP-SS2')
    expect(banner.textContent).toContain('X: +2')
    expect(banner.textContent).toContain('expansion card')
  })

  it('lists every excess category', () => {
    const limits: ModelLimitResult = {
      model: 'DVP-SS2',
      xCount: 9,
      yCount: 9,
      mCount: 600,
      tCount: 0,
      cCount: 0,
      xExcess: 1,
      yExcess: 1,
      mExcess: 88,
      tExcess: 0,
      cExcess: 0,
      anyExcess: true,
    }
    render(<ModelLimitsBanner limits={limits} isLoading={false} error={null} />)
    const banner = screen.getByTestId('model-limits-banner')
    expect(banner.textContent).toContain('X: +1')
    expect(banner.textContent).toContain('Y: +1')
    expect(banner.textContent).toContain('M: +88')
  })

  it('renders loading state when isLoading is true', () => {
    render(<ModelLimitsBanner limits={null} isLoading={true} error={null} />)
    expect(screen.getByTestId('model-limits-banner-loading')).toBeInTheDocument()
  })

  it('renders error message when error is set', () => {
    render(<ModelLimitsBanner limits={null} isLoading={false} error="boom" />)
    const banner = screen.getByTestId('model-limits-banner-error')
    expect(banner).toBeInTheDocument()
    expect(banner.textContent).toContain('boom')
  })

  it('prefers error over limits when both are set', () => {
    const limits: ModelLimitResult = {
      model: 'DVP-SS2',
      xCount: 20,
      yCount: 0,
      mCount: 0,
      tCount: 0,
      cCount: 0,
      xExcess: 12,
      yExcess: 0,
      mExcess: 0,
      tExcess: 0,
      cExcess: 0,
      anyExcess: true,
    }
    render(<ModelLimitsBanner limits={limits} isLoading={false} error="limits unavailable" />)
    expect(screen.getByTestId('model-limits-banner-error')).toBeInTheDocument()
    expect(screen.queryByTestId('model-limits-banner')).toBeNull()
  })
})
