/** Watchouts (docs/superpowers/specs/2026-11-09-watchouts.md): a customer's note, on their jobs. */
import { render, screen } from '@testing-library/react';
import { expect, test } from 'vitest';
import Watchout from '../Watchout';

test("a customer's watchout is shown where the job is worked on", () => {
  render(<Watchout text="Always ask if name badges are needed" />);
  expect(screen.getByRole('note', { name: 'Watchout' })).toHaveTextContent('Watchout: Always ask if name badges are needed');
});

test('nothing when the customer has none, or only spaces', () => {
  const { container, rerender } = render(<Watchout text="" />);
  expect(container).toBeEmptyDOMElement();
  rerender(<Watchout text="   " />);
  expect(container).toBeEmptyDOMElement();
  rerender(<Watchout text={null} />);
  expect(container).toBeEmptyDOMElement();
});
