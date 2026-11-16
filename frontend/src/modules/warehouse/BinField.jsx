/**
 * A field for a bin code that knows the racking. As a code is typed it offers
 * the real boxes it could become (binSuggest.js), and shows the text in
 * capitals for as long as it leads to one — small letters mean the system
 * does not know a location that starts that way.
 *
 * The list works as a combobox list: the arrows move through it, Enter or a
 * click takes one, Escape or leaving the field closes it. It is offered only
 * while the person is typing here; a code already in the field is not
 * second-guessed when the field is merely visited.
 */
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { T } from '../../ui/tokens';
import { asTyped, suggestBins } from './binSuggest';

const LIST_HEIGHT = 216;
const listBox = {
  position: 'fixed', zIndex: 1100, margin: 0, padding: 2, listStyle: 'none', maxHeight: LIST_HEIGHT, overflowY: 'auto',
  background: T.panel, border: `1px solid ${T.hairline}`, borderRadius: T.radius, boxShadow: T.shadowMd,
};

/** `layout` is the branch's racking (null until it is known: nothing is offered or re-cased). Other props go to the input. */
export default function BinField({ value, onValue, layout, ...rest }) {
  const listId = useId();
  const field = useRef(null);
  const list = useRef(null);
  const caret = useRef(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [place, setPlace] = useState(null);

  const offered = open ? suggestBins(layout, value) : [];
  // A whole code that is real has nothing further to offer.
  const options = offered.length === 1 && offered[0] === value.trim() ? [] : offered;
  const showing = options.length > 0;
  const index = Math.min(active, options.length - 1);

  // Re-casing what was typed makes the browser put the caret at the end, so a
  // letter typed into the middle of a code would send the next one to the
  // wrong place. Put it back where it was.
  useLayoutEffect(() => {
    const el = field.current;
    if (caret.current != null && el && document.activeElement === el) el.setSelectionRange(caret.current, caret.current);
    caret.current = null;
  });

  // The list hangs under the field, above whatever the field sits in (a grid
  // that scrolls would cut it off), so it is placed by where the field is.
  useLayoutEffect(() => {
    if (!showing) return;
    const box = field.current.getBoundingClientRect();
    // Under the field — or over it, when the field is too near the bottom of
    // the window for the list to fit and there is more room above.
    const below = window.innerHeight - box.bottom;
    const over = below < LIST_HEIGHT + 8 && box.top > below;
    const at = over ? { bottom: window.innerHeight - box.top + 2 } : { top: box.bottom + 2 };
    setPlace((was) => (was && was.left === box.left && was.width === box.width && was.top === at.top && was.bottom === at.bottom
      ? was : { left: box.left, width: box.width, ...at }));
  }, [showing, value]);

  // The page moving under an open list would leave it behind: close it. (Not
  // when it is the list itself that scrolled.)
  useEffect(() => {
    if (!showing) return undefined;
    const close = (e) => { if (!list.current?.contains(e.target)) setOpen(false); };
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [showing]);

  useEffect(() => {
    if (showing) list.current?.children[index]?.scrollIntoView?.({ block: 'nearest' });
  }, [showing, index]);

  const take = (code) => { onValue(code); setOpen(false); };
  const typed = (e) => {
    caret.current = e.target.selectionStart;
    onValue(asTyped(layout, e.target.value));
    setOpen(true);
    setActive(0);
  };
  const keys = (e) => {
    if (!showing) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((index + (e.key === 'ArrowDown' ? 1 : options.length - 1)) % options.length);
    } else if (e.key === 'Enter') {
      // The choice, not whatever Enter would otherwise do (submit a form).
      e.preventDefault();
      take(options[index]);
    } else if (e.key === 'Escape') {
      // Only the list: Escape must not also close a dialog the field is in.
      e.preventDefault();
      e.stopPropagation();
      setOpen(false);
    }
  };

  return (
    <>
      <input
        {...rest}
        ref={field}
        value={value}
        onChange={typed}
        onKeyDown={keys}
        onBlur={() => setOpen(false)}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={showing}
        aria-controls={showing ? listId : undefined}
        aria-activedescendant={showing ? `${listId}-${index}` : undefined}
        autoComplete="off"
        autoCapitalize="off"
        spellCheck={false}
      />
      {showing && place && (
        <ul ref={list} id={listId} role="listbox" aria-label="Locations this could be"
          style={{ ...listBox, left: place.left, top: place.top, bottom: place.bottom, minWidth: Math.max(place.width, 120) }}>
          {options.map((code, i) => (
            <li
              key={code}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === index}
              // On press, and without taking focus from the field: a click
              // that blurred it first would close the list before it landed.
              onMouseDown={(e) => { e.preventDefault(); take(code); }}
              onMouseEnter={() => setActive(i)}
              style={{
                padding: '3px 8px', cursor: 'pointer', whiteSpace: 'nowrap', borderRadius: T.radius - 1,
                fontFamily: T.fontMono, fontSize: T.fsGrid, color: T.text, background: i === index ? T.accentTint : 'transparent',
              }}
            >
              {code}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
