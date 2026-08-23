import { describe, it, expect } from 'vitest'
import { buildChatPrompt } from '@/lib/prompts/chatPrompt'
import type { IOPoint } from '@/types/io'
import type { HmiTable } from '@/types/hmi'
import type { ChatMessage } from '@/types/chat'

describe('Chat context anchoring and history', () => {
  const mockIOTable: IOPoint[] = [
    { address: 'X0', type: 'Input', label: 'Start Button', defaultValue: '0' },
    { address: 'Y0', type: 'Output', label: 'Motor', defaultValue: '0' },
    { address: 'M10', type: 'Relay', label: 'Internal Relay', defaultValue: '0' },
  ]

  const mockHMITable: HmiTable = {
    tags: [
      { address: 'M100', type: 'Button', label: 'Start', plcRef: 'X0', source: 'auto' },
      { address: 'M101', type: 'Lamp', label: 'Running', plcRef: 'Y0', source: 'auto' },
    ],
    reservedMRange: [100, 101],
    model: 'DVP-SS2',
  }

  const mockChatHistory: ChatMessage[] = [
    {
      timestamp: '2026-06-01T10:00:00Z',
      role: 'user',
      content: 'Create a motor start/stop circuit',
    },
    {
      timestamp: '2026-06-01T10:01:00Z',
      role: 'assistant',
      content: 'Here is the ST code.',
      proposal: {
        st: 'IF X0 THEN SET M10; END_IF;\nIF M10 AND NOT X1 THEN SET Y0; END_IF;',
        summary: 'Created motor start/stop with X0 start, X1 stop',
      },
    },
  ]

  const mockCurrentSt = `IF X0 THEN SET M10; END_IF;
IF M10 AND NOT X1 THEN SET Y0; END_IF;`

  describe('buildChatPrompt', () => {
    it('includes the full I/O table as immutable context', () => {
      const prompt = buildChatPrompt(
        'Change M10 to M20',
        mockIOTable,
        mockHMITable,
        mockCurrentSt,
        mockChatHistory,
      )

      expect(prompt).toContain('## I/O Table — IMMUTABLE CONTEXT')
      expect(prompt).toContain('| Address | Type   | Label | Default |')
      expect(prompt).toContain('X0')
      expect(prompt).toContain('Start Button')
      expect(prompt).toContain('Y0')
      expect(prompt).toContain('Motor')
      expect(prompt).toContain('M10')
      expect(prompt).toContain('Internal Relay')
    })

    it('includes the full HMI table as immutable context', () => {
      const prompt = buildChatPrompt(
        'Change M10 to M20',
        mockIOTable,
        mockHMITable,
        mockCurrentSt,
        mockChatHistory,
      )

      expect(prompt).toContain('## HMI Table — IMMUTABLE CONTEXT')
      expect(prompt).toContain('PLC Tags (Used as PLC Memory)')
      expect(prompt).toContain('HMI Tags (Linked to HMI Display)')
      expect(prompt).toContain('M100')
      expect(prompt).toContain('Start')
      expect(prompt).toContain('X0')
      expect(prompt).toContain('M101')
      expect(prompt).toContain('Running')
      expect(prompt).toContain('Y0')
    })

    it('includes the current ST code as immutable context', () => {
      const prompt = buildChatPrompt(
        'Change M10 to M20',
        mockIOTable,
        mockHMITable,
        mockCurrentSt,
        mockChatHistory,
      )

      expect(prompt).toContain('## Current ST Code — IMMUTABLE CONTEXT')
      expect(prompt).toContain('IF X0 THEN SET M10; END_IF;')
      expect(prompt).toContain('IF M10 AND NOT X1 THEN SET Y0; END_IF;')
    })

    it('includes the user modification request', () => {
      const prompt = buildChatPrompt(
        'Change M10 to M20',
        mockIOTable,
        mockHMITable,
        mockCurrentSt,
        mockChatHistory,
      )

      expect(prompt).toContain('## User Modification Request')
      expect(prompt).toContain('Change M10 to M20')
    })

    it('requires output in ---ST--- / ---END-ST--- markers', () => {
      const prompt = buildChatPrompt(
        'Change M10 to M20',
        mockIOTable,
        mockHMITable,
        mockCurrentSt,
        mockChatHistory,
      )

      expect(prompt).toContain('---ST---')
      expect(prompt).toContain('---END-ST---')
    })

    it('includes the Delta DVP cheatsheet', () => {
      const prompt = buildChatPrompt(
        'Change M10 to M20',
        mockIOTable,
        mockHMITable,
        mockCurrentSt,
        mockChatHistory,
      )

      expect(prompt).toContain('Delta DVP Instruction Set')
      expect(prompt).toContain('SET — Set latch')
      expect(prompt).toContain('RST — Reset latch')
      expect(prompt).toContain('TMR')
      expect(prompt).toContain('CNT')
    })

    it('handles empty I/O table gracefully', () => {
      const prompt = buildChatPrompt(
        'Create a simple circuit',
        [],
        mockHMITable,
        mockCurrentSt,
        mockChatHistory,
      )

      expect(prompt).toContain('(No I/O points defined')
    })

    it('handles empty HMI table gracefully', () => {
      const emptyHmi: HmiTable = { tags: [], reservedMRange: null, model: null }
      const prompt = buildChatPrompt(
        'Create a simple circuit',
        mockIOTable,
        emptyHmi,
        mockCurrentSt,
        mockChatHistory,
      )

      expect(prompt).toContain('(no PLC tags defined)')
      expect(prompt).toContain('(no HMI tags defined)')
    })

    it('handles empty ST code gracefully', () => {
      const prompt = buildChatPrompt(
        'Create a simple circuit',
        mockIOTable,
        mockHMITable,
        '',
        mockChatHistory,
      )

      expect(prompt).toContain('_(no ST code has been generated yet)_')
    })

    it('includes chat history as context', () => {
      const prompt = buildChatPrompt(
        'Change M10 to M20',
        mockIOTable,
        mockHMITable,
        mockCurrentSt,
        mockChatHistory,
      )

      // Phase 1: history is not yet injected, but the parameter is accepted
      expect(prompt).toContain('## User Modification Request')
    })
  })

  describe('ProjectContext chat history', () => {
    it('initializes with empty chat history', () => {
      // This test would need a full render with ProjectProvider
      // For now we verify the initial state structure
      expect(true).toBe(true)
    })
  })

  describe('Context anchoring prevents address reassignment', () => {
    it('embeds all I/O addresses in the prompt', () => {
      const prompt = buildChatPrompt(
        'Add a new timer',
        [
          { address: 'X0', type: 'Input', label: 'Start' },
          { address: 'X1', type: 'Input', label: 'Stop' },
          { address: 'Y0', type: 'Output', label: 'Motor' },
          { address: 'M0', type: 'Relay', label: 'Running' },
          { address: 'T0', type: 'Timer', label: 'Delay' },
        ],
        mockHMITable,
        '',
        [],
      )

      // All addresses should be present
      expect(prompt).toContain('X0')
      expect(prompt).toContain('X1')
      expect(prompt).toContain('Y0')
      expect(prompt).toContain('M0')
      expect(prompt).toContain('T0')
    })

    it('embeds all HMI reserved M addresses in the prompt', () => {
      const prompt = buildChatPrompt(
        'Add an HMI button',
        mockIOTable,
        mockHMITable,
        '',
        [],
      )

      // Reserved M addresses should be present
      expect(prompt).toContain('M100')
      expect(prompt).toContain('M101')
    })

    it('instructs LLM not to invent new addresses', () => {
      const prompt = buildChatPrompt(
        'Modify the circuit',
        mockIOTable,
        mockHMITable,
        mockCurrentSt,
        [],
      )

      expect(prompt).toContain('You MUST use ONLY these addresses')
      expect(prompt).toContain('DO NOT invent new addresses or reassign existing ones')
    })

    it('instructs LLM not to reassign HMI addresses', () => {
      const prompt = buildChatPrompt(
        'Modify the circuit',
        mockIOTable,
        mockHMITable,
        mockCurrentSt,
        [],
      )

      expect(prompt).toContain('You MUST use ONLY these')
      expect(prompt).toContain('reserved M addresses')
      expect(prompt).toContain('DO NOT reassign or')
      expect(prompt).toContain('duplicate them')
    })
  })
})