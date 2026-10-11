import { describe, expect, it } from 'vitest'
import { VARIABLE_NAME } from './schema'
import { formatVariables, toVariableName, variableReferences } from './variables'

describe('variableReferences', () => {
  it('finds dot, optional-chain and bracket access', () => {
    const source = `<h1 title={vars['tagline']}>{vars.clientName} {vars?.date} {vars.clientName}</h1>`
    expect(variableReferences(source).sort()).toEqual(['clientName', 'date', 'tagline'])
  })

  it('ignores other objects whose names end in vars', () => {
    expect(variableReferences('cssvars.x + myVars.y')).toEqual([])
  })
})

describe('toVariableName', () => {
  it.each([
    ['Client name', 'clientName'],
    ['company-tagline', 'companyTagline'],
    ['ClientName', 'clientName'],
    ['2026 date', 'date'],
    ['already', 'already'],
  ])('%s → %s', (input, expected) => {
    expect(toVariableName(input)).toBe(expected)
    expect(VARIABLE_NAME.test(expected)).toBe(true)
  })
})

describe('formatVariables', () => {
  it('is empty without variables', () => {
    expect(formatVariables(undefined)).toBe('')
    expect(formatVariables({})).toBe('')
  })

  it('lists each variable with its value', () => {
    expect(formatVariables({ clientName: 'Acme "Co"' })).toContain('clientName: "Acme \\"Co\\""')
  })
})
