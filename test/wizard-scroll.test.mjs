import assert from 'node:assert/strict'
import test from 'node:test'
import fs from 'node:fs/promises'
import { runInNewContext } from 'node:vm'

const source = await fs.readFile(new URL('../src/client.js', import.meta.url), 'utf8')
const setStepCode = source.slice(source.indexOf('  function setStep(step) {'), source.indexOf('  function assignMotif(id) {'))

function wizard(start, next, anchorOffset = 920) {
  const frames = [], renders = []
  const panel = { scrollTop: start, getBoundingClientRect: () => ({ top: 100 }) }
  const stepper = { getBoundingClientRect: () => ({ top: 100 + anchorOffset - panel.scrollTop }) }
  let focused = false
  const state = { step: 1 }
  const c = runInNewContext(setStepCode + '\n;({setStep})', {
    state, clamp: (value,min,max) => Math.min(max,Math.max(min,value)), persist: () => {},
    renderCreate: preserve => { renders.push(preserve); if (!preserve) panel.scrollTop = 0 },
    $: selector => selector.includes('data-ma-panel') ? panel : selector === '.ma-stepper' ? stepper
      : selector === '.ma-step-card' ? { focus: options => { focused = options.preventScroll } } : null,
    requestAnimationFrame: callback => frames.push(callback),
  })
  c.setStep(next)
  for (const callback of frames) callback()
  return { state, panel, stepper, renders, focused }
}

test('next, previous and step tabs align to the current wizard content instead of the page header', () => {
  for (const next of [2,3,4,5,6,5,2,1]) {
    const result = wizard(1300,next)
    assert.equal(result.state.step,next)
    assert.ok(result.panel.scrollTop > 0, 'step navigation must not return to the long reference/intention header')
    assert.ok(result.stepper.getBoundingClientRect().top >= 100)
    assert.ok(result.stepper.getBoundingClientRect().top <= 124, 'step navigation should show the step tabs and new content together')
    assert.equal(result.focused,true)
  }
})

test('navigation handles a short wizard header without retaining a scroll beyond the new content', () => {
  const result = wizard(500,2,48)
  assert.ok(result.panel.scrollTop >= 0 && result.panel.scrollTop <= 48)
  assert.ok(result.stepper.getBoundingClientRect().top >= 100)
})
