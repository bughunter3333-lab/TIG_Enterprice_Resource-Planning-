import { render, screen } from '@testing-library/react';

test('test infrastructure renders JSX', () => {
  render(<div>hello</div>);
  expect(screen.getByText('hello')).toBeInTheDocument();
});
