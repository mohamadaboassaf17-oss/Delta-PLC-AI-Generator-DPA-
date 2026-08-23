import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { RecentProjectsList } from '@/components/RecentProjectsList'
import type { RecentEntry } from '@/types/project'

const sample: RecentEntry[] = [
  { id: '1', name: 'Alpha', path: '/tmp/alpha.dpa', last_opened: '2026-01-01T00:00:00Z' },
  { id: '2', name: 'Beta', path: '/tmp/beta.dpa', last_opened: '2026-01-02T00:00:00Z' },
  { id: '3', name: 'Gamma', path: '/tmp/gamma.dpa', last_opened: '2026-01-03T00:00:00Z' },
]

describe('RecentProjectsList', () => {
  it('renders 3 skeleton rows while loading', () => {
    render(
      <RecentProjectsList
        recents={[]}
        loading={true}
        onSelect={vi.fn()}
        onRemove={vi.fn()}
      />,
    )
    expect(screen.getByTestId('recent-loading')).toBeInTheDocument()
    expect(screen.getAllByTestId('recent-skeleton-row')).toHaveLength(3)
  })

  it('shows the empty state when there are no recents', () => {
    render(
      <RecentProjectsList
        recents={[]}
        loading={false}
        onSelect={vi.fn()}
        onRemove={vi.fn()}
      />,
    )
    expect(screen.getByTestId('recent-empty')).toHaveTextContent(/no recent projects/i)
  })

  it('renders one row per entry with name and path', () => {
    render(
      <RecentProjectsList
        recents={sample}
        loading={false}
        onSelect={vi.fn()}
        onRemove={vi.fn()}
      />,
    )
    expect(screen.getByTestId('recent-list')).toBeInTheDocument()
    const rows = screen.getAllByTestId('recent-row')
    expect(rows).toHaveLength(3)
    expect(rows[0]).toHaveTextContent('Alpha')
    expect(rows[0]).toHaveTextContent('/tmp/alpha.dpa')
    expect(rows[1]).toHaveTextContent('Beta')
    expect(rows[2]).toHaveTextContent('Gamma')
  })

  it('invokes onRemove with the entry when the remove button is clicked', () => {
    const onRemove = vi.fn()
    render(
      <RecentProjectsList
        recents={sample}
        loading={false}
        onSelect={vi.fn()}
        onRemove={onRemove}
      />,
    )
    const removeButtons = screen.getAllByRole('button', { name: /remove /i })
    fireEvent.click(removeButtons[1])
    expect(onRemove).toHaveBeenCalledTimes(1)
    expect(onRemove).toHaveBeenCalledWith(sample[1])
  })
})
